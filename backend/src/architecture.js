// Module graph (coupling, circular imports), folder structure, README quality
// and project completeness checks.

const fs = require("fs");
const path = require("path");

const JS_EXT = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue"];
const IMPORT_PATTERNS = [
  /\bimport\s+[^;'"]*?from\s*["']([^"']+)["']/,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/,
  /\bimport\s+["']([^"']+)["']/,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/,
  /\bexport\s+[^;]*?\bfrom\s*["']([^"']+)["']/,
];
const PY_IMPORT = /^\s*(?:from\s+([.\w]+)\s+import\b|import\s+([\w.]+))/;

function extractImports(rawLines, lines, language) {
  const specs = [];
  const isPython = language === "Python";
  for (let i = 0; i < rawLines.length; i++) {
    if (lines[i].kind !== "code") continue;
    const line = rawLines[i];
    if (isPython) {
      const m = line.match(PY_IMPORT);
      if (m) specs.push(m[1] || m[2]);
      continue;
    }
    for (const re of IMPORT_PATTERNS) {
      const m = line.match(re);
      if (m) {
        specs.push(m[1]);
        break;
      }
    }
  }
  return specs;
}

function resolveJs(fromFile, spec, fileSet) {
  if (!spec.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  const candidates = [base, ...JS_EXT.map((e) => base + e), ...JS_EXT.map((e) => path.posix.join(base, "index" + e))];
  return candidates.find((c) => fileSet.has(c)) || null;
}

function resolvePython(fromFile, spec, fileSet) {
  const dir = path.posix.dirname(fromFile);
  let target = spec;
  let baseDir = "";
  if (spec.startsWith(".")) {
    const up = spec.match(/^\.+/)[0].length;
    target = spec.slice(up);
    baseDir = dir;
    for (let i = 1; i < up; i++) baseDir = path.posix.dirname(baseDir);
  }
  const rel = target.split(".").filter(Boolean).join("/");
  const roots = baseDir ? [baseDir] : ["", "src", "app", path.posix.dirname(fromFile)];
  for (const root of roots) {
    const base = path.posix.normalize(path.posix.join(root, rel)).replace(/^\.\//, "");
    for (const c of [base + ".py", path.posix.join(base, "__init__.py")]) {
      if (fileSet.has(c)) return c;
    }
  }
  return null;
}

function findCycles(graph) {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map();
  const cycles = [];
  const stack = [];

  function visit(node) {
    if (cycles.length >= 10) return;
    color.set(node, GREY);
    stack.push(node);
    for (const next of graph.get(node) || []) {
      const c = color.get(next) || WHITE;
      if (c === GREY) {
        const start = stack.indexOf(next);
        if (start !== -1) cycles.push([...stack.slice(start), next]);
      } else if (c === WHITE) {
        visit(next);
      }
      if (cycles.length >= 10) break;
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const node of graph.keys()) {
    if ((color.get(node) || WHITE) === WHITE) visit(node);
  }
  return cycles;
}

function buildModuleGraph(importsByFile, fileSet) {
  const graph = new Map();
  const fanIn = new Map();
  const external = new Map();

  for (const [file, specs] of importsByFile) {
    const targets = new Set();
    const isPy = file.endsWith(".py");
    for (const spec of specs) {
      const resolved = isPy ? resolvePython(file, spec, fileSet) : resolveJs(file, spec, fileSet);
      if (resolved && resolved !== file) {
        targets.add(resolved);
        fanIn.set(resolved, (fanIn.get(resolved) || 0) + 1);
      } else if (!resolved && !spec.startsWith(".")) {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
        if (pkg && !/^[a-z]+:/.test(pkg)) external.set(pkg, (external.get(pkg) || 0) + 1);
      }
    }
    graph.set(file, targets);
  }

  const fanOuts = [...graph.entries()].map(([file, t]) => ({ file, fanOut: t.size, fanIn: fanIn.get(file) || 0 }));
  const cycles = findCycles(graph);
  const totalEdges = fanOuts.reduce((s, f) => s + f.fanOut, 0);

  return {
    modules: graph.size,
    internalEdges: totalEdges,
    avgImportsPerFile: graph.size ? Math.round((totalEdges / graph.size) * 100) / 100 : 0,
    externalPackages: external.size,
    topExternal: [...external.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    mostDepended: fanOuts.filter((f) => f.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn).slice(0, 8),
    mostCoupled: fanOuts.filter((f) => f.fanOut > 0).sort((a, b) => b.fanOut - a.fanOut).slice(0, 8),
    circularCount: cycles.length,
    circular: cycles.slice(0, 6).map((c) => c.map((f) => f.split("/").pop()).join(" -> ")),
    circularFull: cycles.slice(0, 6),
  };
}

function analyzeFolders(sourceFiles) {
  const folders = new Map();
  let maxDepth = 0;
  for (const f of sourceFiles) {
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ".";
    folders.set(dir, (folders.get(dir) || 0) + 1);
    maxDepth = Math.max(maxDepth, dir === "." ? 0 : dir.split("/").length);
  }
  const rootFiles = folders.get(".") || 0;
  const topLevel = new Map();
  for (const f of sourceFiles) {
    const top = f.includes("/") ? f.split("/")[0] : "(root)";
    topLevel.set(top, (topLevel.get(top) || 0) + 1);
  }
  return {
    folderCount: folders.size,
    maxDepth,
    avgFilesPerFolder: folders.size ? Math.round((sourceFiles.length / folders.size) * 10) / 10 : 0,
    rootFileCount: rootFiles,
    flatLayout: sourceFiles.length >= 8 && rootFiles / sourceFiles.length > 0.7,
    topLevelDirs: [...topLevel.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, files]) => ({ name, files })),
  };
}

const README_SECTIONS = [
  { key: "setup", label: "Installation / setup", re: /^#{1,6}.*\b(install|setup|set up|getting started|prerequisite|requirement|installation)\b/im },
  { key: "usage", label: "Usage / how to run", re: /^#{1,6}.*\b(usage|how to (?:use|run)|running|run the|quick ?start|example)\b/im },
  { key: "features", label: "Features", re: /^#{1,6}.*\b(feature|functionalit|what it does|modules?)\b/im },
  { key: "stack", label: "Tech stack", re: /^#{1,6}.*\b(tech|stack|built with|technolog|architecture|dependencies)\b/im },
  { key: "media", label: "Screenshots / demo", re: /!\[[^\]]*\]\(|<img\s|^#{1,6}.*\b(screenshot|demo|preview)\b/im },
  { key: "author", label: "Authors / team", re: /^#{1,6}.*\b(author|team|contributor|credits?|developed by)\b/im },
];

function analyzeReadme(rootDir, allRel) {
  const file = allRel.find((p) => /^readme(?:\.(?:md|rst|txt))?$/i.test(p)) || allRel.find((p) => /^readme\./i.test(p));
  if (!file) return { present: false, score: 0, sections: README_SECTIONS.map((s) => ({ ...s, found: false, re: undefined })) };

  let text = "";
  try {
    text = fs.readFileSync(path.join(rootDir, file), "utf8");
  } catch {
    return { present: false, score: 0, sections: [] };
  }

  const words = (text.match(/\b[\w'-]+\b/g) || []).length;
  const headings = (text.match(/^#{1,6}\s+\S/gm) || []).length;
  const codeBlocks = (text.match(/```/g) || []).length >> 1;
  const images = (text.match(/!\[[^\]]*\]\(|<img\s/gi) || []).length;
  const links = (text.match(/\[[^\]]+\]\(https?:/g) || []).length;
  const sections = README_SECTIONS.map((s) => ({ key: s.key, label: s.label, found: s.re.test(text) }));
  const foundCount = sections.filter((s) => s.found).length;

  const lengthScore = Math.min(30, (words / 400) * 30);
  const sectionScore = (foundCount / README_SECTIONS.length) * 40;
  const commandScore = Math.min(20, codeBlocks * 7);
  const mediaScore = images > 0 ? 10 : 0;

  return {
    present: true,
    file,
    words,
    headings,
    codeBlocks,
    images,
    links,
    sections,
    score: Math.round(lengthScore + sectionScore + commandScore + mediaScore),
  };
}

function analyzeCompleteness(rootDir, allRel, { hasTests, envUsage, hasCI, hasLicense }) {
  const has = (re) => allRel.some((p) => re.test(p));
  let runnable = has(/^(?:Makefile|Dockerfile|docker-compose\.ya?ml|mvnw|gradlew|build\.gradle|pom\.xml|CMakeLists\.txt)$/i);
  if (!runnable) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
      runnable = Boolean(pkg.scripts && Object.keys(pkg.scripts).length);
    } catch {
      runnable = false;
    }
  }

  const checks = [
    { key: "manifest", label: "Dependency manifest", ok: has(/(?:^|\/)(?:package\.json|requirements\.txt|Pipfile|pyproject\.toml|pom\.xml|build\.gradle|Gemfile|go\.mod|Cargo\.toml|composer\.json)$/i) },
    { key: "runnable", label: "Build or run script", ok: runnable },
    { key: "tests", label: "Automated tests", ok: hasTests },
    { key: "ci", label: "CI pipeline", ok: hasCI },
    { key: "gitignore", label: ".gitignore", ok: allRel.includes(".gitignore") },
    { key: "license", label: "License", ok: hasLicense },
    { key: "envExample", label: "Example environment file", ok: !envUsage || has(/(?:^|\/)\.env\.(?:example|sample|template)$|(?:^|\/)env\.example$/i), na: !envUsage },
    { key: "schema", label: "Database schema or migrations", ok: has(/(?:^|\/)(?:migrations?|schema|prisma|alembic)\//i) || has(/\.(?:sql|prisma)$/i), na: false },
    { key: "apidocs", label: "API documentation", ok: has(/(?:openapi|swagger)[\w.-]*\.(?:ya?ml|json)$/i) || has(/(?:^|\/)docs?\//i) },
  ];

  const applicable = checks.filter((c) => !c.na);
  return {
    checks,
    satisfied: applicable.filter((c) => c.ok).length,
    applicable: applicable.length,
    percent: applicable.length ? Math.round((applicable.filter((c) => c.ok).length / applicable.length) * 100) : 0,
  };
}

function analyzeArchitecture(rootDir, { allRel, importsByFile, sourceFiles, envUsage, hasTests, hasCI, hasLicense, godFiles }) {
  const fileSet = new Set(sourceFiles);
  const graph = buildModuleGraph(importsByFile, fileSet);
  const folders = analyzeFolders(sourceFiles);
  const readme = analyzeReadme(rootDir, allRel);
  const completeness = analyzeCompleteness(rootDir, allRel, { hasTests, envUsage, hasCI, hasLicense });

  return { graph, folders, readme, completeness, godFiles };
}

module.exports = { analyzeArchitecture, extractImports };
