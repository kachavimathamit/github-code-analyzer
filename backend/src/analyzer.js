const fs = require("fs");
const path = require("path");

const { preprocess, computeFunctionMetrics, analyzeNaming } = require("./codeMetrics");
const { DuplicationDetector, normalizeCodeLines } = require("./duplication");
const { isTestFile, extractTodos, collectExports, findUnusedExports } = require("./hygiene");
const { scanSecrets, scanFilename } = require("./secrets");
const { scanPatterns, checkStructure, summarizeFindings } = require("./patterns");
const { extractImports } = require("./architecture");

const LANGUAGE_MAP = {
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".py": "Python", ".java": "Java",
  ".c": "C", ".h": "C",
  ".cpp": "C++", ".hpp": "C++", ".cc": "C++",
  ".cs": "C#", ".go": "Go", ".rb": "Ruby", ".php": "PHP", ".swift": "Swift", ".kt": "Kotlin", ".rs": "Rust",
  ".html": "HTML", ".css": "CSS", ".scss": "SCSS", ".json": "JSON", ".md": "Markdown",
  ".sql": "SQL", ".sh": "Shell", ".yml": "YAML", ".yaml": "YAML",
};

const CODE_LANGUAGES = new Set(["JavaScript", "TypeScript", "Python", "Java", "C", "C++", "C#", "Go", "Ruby", "PHP", "Swift", "Kotlin", "Rust"]);
const EXPORT_LANGUAGES = new Set(["JavaScript", "TypeScript", "Python"]);

const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", ".next", "vendor", "venv", ".venv", "__pycache__",
  "coverage", ".cache", "target", "out", ".idea", ".vscode", "bower_components",
]);

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".pdf", ".zip", ".gz", ".tar", ".tgz", ".7z", ".jar",
  ".class", ".exe", ".dll", ".so", ".dylib", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".mp3", ".mp4", ".mov",
  ".avi", ".wav", ".psd", ".bin", ".pyc", ".o", ".a", ".wasm", ".sqlite", ".db",
]);

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SECRET_SCAN_BYTES = 1024 * 1024;
const MAX_FILES = 8000;
const LONG_FUNCTION_LINES = 50;
const HIGH_COMPLEXITY = 10;
const DEEP_NESTING = 4;
const MANY_PARAMS = 5;
const GOD_FILE_LINES = 500;
// Only treat a project as needing a committed .env example when it actually
// loads a .env file, not merely when it reads process.env.NODE_ENV.
const ENV_USAGE = /\bdotenv\b|load_dotenv|\.env\b.*(?:config|load)|require\(["']dotenv/i;

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

function walkDirectory(rootDir) {
  const files = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  })(rootDir);
  return files;
}

function median(sorted) {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function functionMaintainability(length, complexity) {
  const loc = Math.max(length, 1);
  const volume = loc * 8;
  const mi = ((171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(loc)) * 100) / 171;
  return Math.max(0, mi);
}

function readEntryFiles(rootDir, allRel) {
  const entries = new Set();
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const add = (p) => typeof p === "string" && entries.add(p.replace(/^\.\//, ""));
    add(pkg.main);
    add(pkg.module);
    if (typeof pkg.bin === "string") add(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === "object") Object.values(pkg.bin).forEach(add);
  } catch {
    // no root package.json
  }
  for (const rel of allRel) {
    if (/^(?:[^/]+\/){0,2}index\.[cm]?[jt]sx?$/.test(rel)) entries.add(rel);
  }
  return entries;
}

function analyzeRepository(rootDir) {
  const allAbs = walkDirectory(rootDir);
  const truncated = allAbs.length > MAX_FILES;
  const files = truncated ? allAbs.slice(0, MAX_FILES) : allAbs;
  const allRel = files.map((f) => path.relative(rootDir, f).replace(/\\/g, "/"));

  const languageStats = {};
  const fileReports = [];
  const fnStats = [];
  const todoItems = [];
  const secretFindings = [];
  const exportsList = [];
  const exportSources = [];
  const namingByLang = {};
  const shortNameCounts = {};
  const dup = new DuplicationDetector();
  const testing = { testFiles: 0, testLines: 0, sourceFiles: 0, sourceLines: 0 };
  const manifestPaths = [];
  const patternFindings = [];
  const structuralIssues = [];
  const importsByFile = new Map();
  const sourceFilePaths = [];
  const godFiles = [];
  let magicNumbers = 0;
  let longParamCount = 0;
  let envUsage = false;

  let totalFiles = 0;
  let analyzedFiles = 0;
  let skippedFiles = 0;
  let totalBytes = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const abs = files[fi];
    const rel = allRel[fi];
    totalFiles++;

    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      skippedFiles++;
      continue;
    }
    totalBytes += stat.size;

    const base = path.basename(rel);
    if (/^(?:package\.json|package-lock\.json|requirements\.txt)$/.test(base)) manifestPaths.push(rel);

    const isTest = isTestFile(rel);
    const sensitive = scanFilename(rel, isTest);
    if (sensitive) secretFindings.push(sensitive);

    const ext = path.extname(abs).toLowerCase();
    const language = LANGUAGE_MAP[ext] || null;
    if (BINARY_EXT.has(ext) || stat.size > MAX_FILE_BYTES) {
      skippedFiles++;
      continue;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(abs);
    } catch {
      skippedFiles++;
      continue;
    }
    if (buffer.subarray(0, 8000).includes(0)) {
      skippedFiles++;
      continue;
    }
    const text = buffer.toString("utf8");

    if (stat.size <= MAX_SECRET_SCAN_BYTES) secretFindings.push(...scanSecrets(rel, text, isTest));

    if (!language) {
      skippedFiles++;
      continue;
    }
    analyzedFiles++;

    let report;
    if (CODE_LANGUAGES.has(language)) {
      const rawLines = text.split(/\r\n|\r|\n/);
      const lines = preprocess(text, language);
      let blank = 0;
      let comment = 0;
      let code = 0;
      for (const l of lines) {
        if (l.kind === "blank") blank++;
        else if (l.kind === "comment") comment++;
        else code++;
      }

      const fm = computeFunctionMetrics(lines, language);
      const functionCount = fm.functions.length;
      const complexity = fm.fileDecisions + Math.max(functionCount, 1);

      if (isTest) {
        testing.testFiles++;
        testing.testLines += code;
      } else {
        testing.sourceFiles++;
        testing.sourceLines += code;
        for (const f of fm.functions) {
          if (f.iife) continue;
          fnStats.push({ file: rel, name: f.name, line: f.line, length: f.length, complexity: f.complexity, nesting: f.nesting, params: f.params });
          if (f.params > MANY_PARAMS) longParamCount++;
        }
        if (code > GOD_FILE_LINES) godFiles.push({ path: rel, codeLines: code, functions: functionCount });
      }

      const pat = scanPatterns(rel, rawLines, lines, language, isTest);
      patternFindings.push(...pat.findings);
      magicNumbers += pat.magicNumbers;
      const structural = checkStructure(rel, lines, language);
      if (structural) structuralIssues.push(structural);
      if (!envUsage && ENV_USAGE.test(text)) envUsage = true;
      importsByFile.set(rel, extractImports(rawLines, lines, language));
      sourceFilePaths.push(rel);

      const naming = analyzeNaming(lines, language);
      const nb = (namingByLang[language] ||= { camel: 0, snake: 0, pascal: 0, constant: 0, neutral: 0, short: 0, total: 0 });
      for (const k of Object.keys(nb)) nb[k] += naming.counts[k];
      for (const [n, c] of Object.entries(naming.shortNames)) shortNameCounts[n] = (shortNameCounts[n] || 0) + c;

      todoItems.push(...extractTodos(rel, lines));

      if (EXPORT_LANGUAGES.has(language)) {
        exportsList.push(...collectExports(rel, lines, language));
        exportSources.push({ path: rel, abs, language });
      }

      if (!isTest) dup.addFile(rel, normalizeCodeLines(lines));

      report = {
        path: rel, language, sizeBytes: stat.size, isTest,
        totalLines: lines.length, blankLines: blank, commentLines: comment, codeLines: code,
        functionCount, cyclomaticComplexity: complexity, maxNesting: fm.deepestNesting,
      };
    } else {
      const lines = text.split(/\r\n|\r|\n/);
      const blank = lines.filter((l) => l.trim() === "").length;
      report = {
        path: rel, language, sizeBytes: stat.size, isTest,
        totalLines: lines.length, blankLines: blank, commentLines: 0, codeLines: lines.length - blank,
        functionCount: 0, cyclomaticComplexity: 0, maxNesting: 0,
      };
    }

    const bucket = (languageStats[language] ||= {
      language, files: 0, totalLines: 0, codeLines: 0, commentLines: 0, blankLines: 0, functionCount: 0, complexitySum: 0,
    });
    bucket.files++;
    bucket.totalLines += report.totalLines;
    bucket.codeLines += report.codeLines;
    bucket.commentLines += report.commentLines;
    bucket.blankLines += report.blankLines;
    bucket.functionCount += report.functionCount;
    bucket.complexitySum += report.cyclomaticComplexity;
    fileReports.push(report);
  }

  // ---- Aggregates ---------------------------------------------------------
  let totalCodeLines = 0;
  let totalCommentLines = 0;
  let totalBlankLines = 0;
  let totalFunctions = 0;
  let totalComplexity = 0;
  let codeLanguageFiles = 0;

  const languageBreakdown = Object.values(languageStats)
    .map((b) => {
      if (CODE_LANGUAGES.has(b.language)) {
        totalCodeLines += b.codeLines;
        totalCommentLines += b.commentLines;
        totalBlankLines += b.blankLines;
        totalFunctions += b.functionCount;
        totalComplexity += b.complexitySum;
        codeLanguageFiles += b.files;
      }
      return b;
    })
    .sort((a, b) => b.totalLines - a.totalLines);

  const totalLinesAll = languageBreakdown.reduce((s, b) => s + b.totalLines, 0);
  const commentRatio = totalCodeLines + totalCommentLines > 0 ? totalCommentLines / (totalCodeLines + totalCommentLines) : 0;

  // Functions
  const lengths = fnStats.map((f) => f.length).sort((a, b) => a - b);
  const sum = (arr, key) => arr.reduce((s, x) => s + x[key], 0);
  const nFn = fnStats.length;
  let miWeighted = 0;
  let miWeight = 0;
  for (const f of fnStats) {
    miWeighted += functionMaintainability(f.length, f.complexity) * f.length;
    miWeight += f.length;
  }
  const maintainabilityIndex = miWeight ? r1(miWeighted / miWeight) : null;
  const pick = (cmp) => [...fnStats].sort(cmp).slice(0, 10);

  const functions = {
    analyzed: nFn,
    avgLength: nFn ? r1(sum(fnStats, "length") / nFn) : 0,
    medianLength: median(lengths),
    maxLength: lengths.length ? lengths[lengths.length - 1] : 0,
    longCount: fnStats.filter((f) => f.length > LONG_FUNCTION_LINES).length,
    longThreshold: LONG_FUNCTION_LINES,
    avgComplexity: nFn ? r2(sum(fnStats, "complexity") / nFn) : 0,
    maxComplexity: nFn ? Math.max(...fnStats.map((f) => f.complexity)) : 0,
    highComplexityCount: fnStats.filter((f) => f.complexity > HIGH_COMPLEXITY).length,
    complexityThreshold: HIGH_COMPLEXITY,
    avgNesting: nFn ? r2(sum(fnStats, "nesting") / nFn) : 0,
    deepestNesting: nFn ? Math.max(...fnStats.map((f) => f.nesting)) : 0,
    deepCount: fnStats.filter((f) => f.nesting >= DEEP_NESTING).length,
    nestingThreshold: DEEP_NESTING,
    longParamCount,
    paramThreshold: MANY_PARAMS,
    maxParams: nFn ? Math.max(...fnStats.map((f) => f.params || 0)) : 0,
    longest: pick((a, b) => b.length - a.length),
    mostComplex: pick((a, b) => b.complexity - a.complexity),
    deepest: pick((a, b) => b.nesting - a.nesting || b.length - a.length),
    lengthDistribution: [
      { bucket: "1-10", count: fnStats.filter((f) => f.length <= 10).length },
      { bucket: "11-25", count: fnStats.filter((f) => f.length > 10 && f.length <= 25).length },
      { bucket: "26-50", count: fnStats.filter((f) => f.length > 25 && f.length <= 50).length },
      { bucket: "51-100", count: fnStats.filter((f) => f.length > 50 && f.length <= 100).length },
      { bucket: "100+", count: fnStats.filter((f) => f.length > 100).length },
    ],
  };

  // Naming
  const namingTotals = { camel: 0, snake: 0, pascal: 0, constant: 0, neutral: 0, short: 0, total: 0 };
  let consistentNames = 0;
  let mixedBase = 0;
  for (const c of Object.values(namingByLang)) {
    for (const k of Object.keys(namingTotals)) namingTotals[k] += c[k];
    consistentNames += Math.max(c.camel, c.snake);
    mixedBase += c.camel + c.snake;
  }
  const naming = {
    totalNames: namingTotals.total,
    camelCase: namingTotals.camel,
    snakeCase: namingTotals.snake,
    pascalCase: namingTotals.pascal,
    constants: namingTotals.constant,
    consistencyPercent: mixedBase ? r1((consistentNames / mixedBase) * 100) : null,
    dominantStyle: namingTotals.camel === 0 && namingTotals.snake === 0 ? null : namingTotals.camel >= namingTotals.snake ? "camelCase" : "snake_case",
    shortNameCount: namingTotals.short,
    shortNamePercent: namingTotals.total ? r1((namingTotals.short / namingTotals.total) * 100) : 0,
    shortNameExamples: Object.entries(shortNameCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    byLanguage: Object.entries(namingByLang)
      .map(([language, c]) => ({ language, camelCase: c.camel, snakeCase: c.snake, pascalCase: c.pascal, constants: c.constant }))
      .sort((a, b) => b.camelCase + b.snakeCase - (a.camelCase + a.snakeCase))
      .slice(0, 6),
  };

  // TODO markers
  const markerCounts = { TODO: 0, FIXME: 0, HACK: 0, XXX: 0 };
  const perFile = {};
  for (const t of todoItems) {
    markerCounts[t.marker]++;
    perFile[t.file] = (perFile[t.file] || 0) + 1;
  }
  const priority = { FIXME: 0, HACK: 1, XXX: 2, TODO: 3 };
  const todos = {
    total: todoItems.length,
    densityPer1kLines: totalCodeLines ? r2((todoItems.length / totalCodeLines) * 1000) : 0,
    byMarker: Object.entries(markerCounts).map(([marker, count]) => ({ marker, count })),
    topFiles: Object.entries(perFile).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([file, count]) => ({ file, count })),
    items: [...todoItems].sort((a, b) => priority[a.marker] - priority[b.marker]).slice(0, 15),
  };

  // Tests
  const flags = {
    hasReadme: allRel.some((p) => /^readme(?:\.|$)/i.test(p)),
    hasLicenseFile: allRel.some((p) => /^(?:license|licence|copying)(?:\.|$)/i.test(p)),
    hasGitignore: allRel.includes(".gitignore"),
    hasCI: allRel.some((p) => /^\.github\/workflows\/|^\.circleci\/|^\.gitlab-ci\.yml$|^\.travis\.yml$|^Jenkinsfile$|^azure-pipelines\.yml$/.test(p)),
  };
  const testResult = {
    ...testing,
    hasTests: testing.testFiles > 0,
    testToSourceRatioPercent: testing.sourceLines ? r1((testing.testLines / testing.sourceLines) * 100) : null,
    hasCI: flags.hasCI,
  };

  // Duplication
  const duplication = dup.result();

  // Unused code (heuristic)
  const entryFiles = readEntryFiles(rootDir, allRel);
  const { candidates, unused } = findUnusedExports(exportsList, exportSources, entryFiles);
  const deadCode = {
    candidates,
    unusedCount: unused.length,
    unusedPercent: candidates ? r1((unused.length / candidates) * 100) : 0,
    items: unused.slice(0, 15).map((e) => ({ file: e.file, name: e.name, line: e.line, kind: e.kind })),
  };

  // Secrets
  const severityRank = { high: 0, medium: 1, low: 2 };
  secretFindings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const secrets = {
    total: secretFindings.length,
    high: secretFindings.filter((s) => s.severity === "high").length,
    medium: secretFindings.filter((s) => s.severity === "medium").length,
    low: secretFindings.filter((s) => s.severity === "low").length,
    filesAffected: new Set(secretFindings.map((s) => s.file)).size,
    findings: secretFindings.slice(0, 40),
  };

  manifestPaths.sort((a, b) => a.split("/").length - b.split("/").length);

  return {
    summary: {
      totalFiles,
      analyzedFiles,
      skippedFiles,
      truncated,
      totalBytes,
      totalLines: totalLinesAll,
      totalCodeLines,
      totalCommentLines,
      totalBlankLines,
      totalFunctions,
      avgComplexityPerFile: codeLanguageFiles ? r2(totalComplexity / codeLanguageFiles) : 0,
      avgFunctionsPerFile: codeLanguageFiles ? r2(totalFunctions / codeLanguageFiles) : 0,
      avgComplexityPerFunction: functions.avgComplexity,
      commentRatioPercent: r2(commentRatio * 100),
      maintainabilityIndex,
    },
    languageBreakdown,
    largestFiles: [...fileReports].sort((a, b) => b.totalLines - a.totalLines).slice(0, 10),
    mostComplexFiles: fileReports
      .filter((f) => CODE_LANGUAGES.has(f.language) && !f.isTest)
      .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
      .slice(0, 10),
    functions,
    duplication,
    naming,
    todos,
    testing: testResult,
    deadCode,
    secrets,
    flags,
    manifestPaths,
    robustness: summarizeFindings(patternFindings, structuralIssues, {
      magicNumbers,
      magicNumberDensity: totalCodeLines ? r2((magicNumbers / totalCodeLines) * 1000) : 0,
      longParamCount,
      paramThreshold: MANY_PARAMS,
      godFiles: godFiles.sort((a, b) => b.codeLines - a.codeLines).slice(0, 8),
      godFileCount: godFiles.length,
      godFileThreshold: GOD_FILE_LINES,
    }),
    internals: {
      allRel,
      importsByFile,
      sourceFilePaths,
      envUsage,
      fingerprintsByFile: dup.fingerprints,
      fileRecords: fileReports.map((f) => ({ path: f.path, codeLines: f.codeLines, isTest: f.isTest, language: f.language })),
      godFiles,
    },
  };
}

module.exports = { analyzeRepository };
