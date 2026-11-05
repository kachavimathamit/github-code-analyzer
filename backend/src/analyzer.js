const fs = require("fs");
const path = require("path");

// Extension -> language label
const LANGUAGE_MAP = {
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".py": "Python",
  ".java": "Java",
  ".c": "C",
  ".h": "C",
  ".cpp": "C++",
  ".hpp": "C++",
  ".cc": "C++",
  ".cs": "C#",
  ".go": "Go",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".rs": "Rust",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".json": "JSON",
  ".md": "Markdown",
  ".sql": "SQL",
  ".sh": "Shell",
  ".yml": "YAML",
  ".yaml": "YAML",
};

// Languages we run full code-quality metrics on (vs just counting lines)
const CODE_LANGUAGES = new Set([
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C",
  "C++",
  "C#",
  "Go",
  "Ruby",
  "PHP",
  "Swift",
  "Kotlin",
  "Rust",
]);

const COMMENT_STYLES = {
  default: { line: ["//"], blockStart: "/*", blockEnd: "*/" },
  Python: { line: ["#"], blockStart: '"""', blockEnd: '"""' },
  Ruby: { line: ["#"], blockStart: "=begin", blockEnd: "=end" },
};

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
  "coverage",
  ".cache",
  "target",
  "out",
  ".idea",
  ".vscode",
]);

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // skip huge/binary-ish files

const FUNCTION_PATTERNS = [
  /\bfunction\s+[A-Za-z0-9_]*\s*\(/g, // JS function decl
  /\b[A-Za-z0-9_]+\s*=\s*(async\s*)?\([^)]*\)\s*=>/g, // JS/TS arrow fn assigned
  /\bdef\s+[A-Za-z0-9_]+\s*\(/g, // Python
  /\b(public|private|protected|static|final)\s+[\w<>\[\]]+\s+[A-Za-z0-9_]+\s*\([^)]*\)\s*\{/g, // Java/C#
  /\bfunc\s+[A-Za-z0-9_]*\s*\(/g, // Go/Swift
];

const COMPLEXITY_KEYWORDS = [
  /\bif\b/g,
  /\belse if\b/g,
  /\belif\b/g,
  /\bfor\b/g,
  /\bforeach\b/g,
  /\bwhile\b/g,
  /\bcase\b/g,
  /\bcatch\b/g,
  /\b\?\s*[^:]+:/g, // ternary
  /&&/g,
  /\|\|/g,
];

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

function stripStringsAndRegexNoise(code) {
  // Rough removal of string literal contents so keywords inside strings don't get counted.
  return code
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function countMatches(text, regexes) {
  let total = 0;
  for (const re of regexes) {
    const matches = text.match(re);
    total += matches ? matches.length : 0;
  }
  return total;
}

function analyzeFileContent(content, language) {
  const lines = content.split(/\r\n|\r|\n/);
  const totalLines = lines.length;

  let blankLines = 0;
  let commentLines = 0;
  let inBlockComment = false;

  const style = COMMENT_STYLES[language] || COMMENT_STYLES.default;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      blankLines++;
      continue;
    }
    if (inBlockComment) {
      commentLines++;
      if (line.includes(style.blockEnd)) inBlockComment = false;
      continue;
    }
    if (style.line.some((marker) => line.startsWith(marker))) {
      commentLines++;
      continue;
    }
    if (style.blockStart !== style.blockEnd && line.includes(style.blockStart) && !line.includes(style.blockEnd)) {
      commentLines++;
      inBlockComment = true;
      continue;
    }
  }

  const codeLines = totalLines - blankLines - commentLines;
  const cleanedCode = stripStringsAndRegexNoise(content);
  const functionCount = countMatches(cleanedCode, FUNCTION_PATTERNS);
  const decisionPoints = countMatches(cleanedCode, COMPLEXITY_KEYWORDS);
  // Cyclomatic complexity approximation: decision points + 1 per function (min 1 overall)
  const cyclomaticComplexity = decisionPoints + Math.max(functionCount, 1);

  return {
    totalLines,
    blankLines,
    commentLines,
    codeLines: Math.max(codeLines, 0),
    functionCount,
    cyclomaticComplexity,
  };
}

function walkDirectory(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

// Maintainability Index approximation (Microsoft-style, simplified):
// MI = 171 - 5.2*ln(avgVolume) - 0.23*avgComplexity - 16.2*ln(avgLOC) + 50*sin(sqrt(2.4*commentRatio))
// We use codeLines as a stand-in for Halstead Volume since full Halstead parsing is out of scope.
function computeMaintainabilityIndex({ avgComplexity, avgCodeLines, commentRatio }) {
  const safeLoc = Math.max(avgCodeLines, 1);
  const safeComplexity = Math.max(avgComplexity, 1);
  const volumeProxy = safeLoc * 2; // rough stand-in, keeps ln() stable and monotonic with size
  let mi =
    171 -
    5.2 * Math.log(volumeProxy) -
    0.23 * safeComplexity -
    16.2 * Math.log(safeLoc) +
    50 * Math.sin(Math.sqrt(2.4 * commentRatio));
  mi = Math.max(0, Math.min(100, mi));
  return Math.round(mi * 10) / 10;
}

function gradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function analyzeRepository(rootDir) {
  const allFiles = walkDirectory(rootDir);

  const languageStats = {}; // lang -> { files, totalLines, codeLines, commentLines, blankLines, functionCount, complexitySum }
  const fileReports = [];
  let totalFiles = 0;
  let analyzedFiles = 0;
  let skippedFiles = 0;
  let totalBytes = 0;

  for (const filePath of allFiles) {
    totalFiles++;
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      skippedFiles++;
      continue;
    }
    totalBytes += stat.size;

    const language = detectLanguage(filePath);
    if (!language || stat.size > MAX_FILE_SIZE_BYTES) {
      skippedFiles++;
      continue;
    }

    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      skippedFiles++;
      continue;
    }

    analyzedFiles++;
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
    const metrics = analyzeFileContent(content, language);

    if (!languageStats[language]) {
      languageStats[language] = {
        language,
        files: 0,
        totalLines: 0,
        codeLines: 0,
        commentLines: 0,
        blankLines: 0,
        functionCount: 0,
        complexitySum: 0,
      };
    }
    const bucket = languageStats[language];
    bucket.files++;
    bucket.totalLines += metrics.totalLines;
    bucket.codeLines += metrics.codeLines;
    bucket.commentLines += metrics.commentLines;
    bucket.blankLines += metrics.blankLines;
    bucket.functionCount += metrics.functionCount;
    bucket.complexitySum += metrics.cyclomaticComplexity;

    fileReports.push({
      path: relativePath,
      language,
      sizeBytes: stat.size,
      ...metrics,
    });
  }

  // Aggregate totals across "code" languages only (exclude markup/config from complexity scoring)
  let totalCodeLines = 0;
  let totalCommentLines = 0;
  let totalBlankLines = 0;
  let totalFunctionCount = 0;
  let totalComplexity = 0;
  let codeLanguageFileCount = 0;

  const languageBreakdown = Object.values(languageStats)
    .map((bucket) => {
      if (CODE_LANGUAGES.has(bucket.language)) {
        totalCodeLines += bucket.codeLines;
        totalCommentLines += bucket.commentLines;
        totalBlankLines += bucket.blankLines;
        totalFunctionCount += bucket.functionCount;
        totalComplexity += bucket.complexitySum;
        codeLanguageFileCount += bucket.files;
      }
      return bucket;
    })
    .sort((a, b) => b.totalLines - a.totalLines);

  const totalLinesAll = languageBreakdown.reduce((sum, b) => sum + b.totalLines, 0);

  const commentRatio = totalCodeLines + totalCommentLines > 0 ? totalCommentLines / (totalCodeLines + totalCommentLines) : 0;
  const avgComplexityPerFile = codeLanguageFileCount > 0 ? totalComplexity / codeLanguageFileCount : 0;
  const avgCodeLinesPerFile = codeLanguageFileCount > 0 ? totalCodeLines / codeLanguageFileCount : 0;
  const avgFunctionsPerFile = codeLanguageFileCount > 0 ? totalFunctionCount / codeLanguageFileCount : 0;

  const maintainabilityIndex = computeMaintainabilityIndex({
    avgComplexity: avgComplexityPerFile,
    avgCodeLines: avgCodeLinesPerFile,
    commentRatio,
  });

  const largestFiles = [...fileReports].sort((a, b) => b.totalLines - a.totalLines).slice(0, 10);
  const mostComplexFiles = [...fileReports]
    .filter((f) => CODE_LANGUAGES.has(f.language))
    .sort((a, b) => b.cyclomaticComplexity - a.cyclomaticComplexity)
    .slice(0, 10);

  // Overall quality score: blend of maintainability, complexity penalty, and comment coverage
  const complexityPenalty = Math.max(0, 100 - avgComplexityPerFile * 4);
  const commentBonus = Math.min(100, commentRatio * 200);
  const overallScore = Math.round(maintainabilityIndex * 0.5 + complexityPenalty * 0.35 + commentBonus * 0.15);
  const grade = gradeFromScore(overallScore);

  return {
    summary: {
      totalFiles,
      analyzedFiles,
      skippedFiles,
      totalBytes,
      totalLines: totalLinesAll,
      totalCodeLines,
      totalCommentLines,
      totalBlankLines,
      totalFunctions: totalFunctionCount,
      avgComplexityPerFile: round2(avgComplexityPerFile),
      avgFunctionsPerFile: round2(avgFunctionsPerFile),
      commentRatioPercent: round2(commentRatio * 100),
      maintainabilityIndex,
      overallScore,
      grade,
    },
    languageBreakdown,
    largestFiles,
    mostComplexFiles,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { analyzeRepository };
