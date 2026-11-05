const fs = require("fs");

// ---------------------------------------------------------------------------
// Test file classification
// ---------------------------------------------------------------------------
const TEST_PATH = [
  /(?:^|\/)(?:tests?|__tests__|spec|specs|e2e|testing)\//i,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/i,
  /_test\.(?:py|go|rb|c|cc|cpp)$/i,
  /(?:^|\/)test_[^/]+\.py$/i,
  /(?:Test|Tests|IT)\.(?:java|kt|cs|swift)$/,
  /(?:^|\/)conftest\.py$/,
];

function isTestFile(relPath) {
  return TEST_PATH.some((re) => re.test(relPath));
}

// ---------------------------------------------------------------------------
// TODO / FIXME / HACK / XXX markers (comments only)
// ---------------------------------------------------------------------------
const MARKER = /\b(TODO|FIXME|HACK|XXX)\b/;

function extractTodos(relPath, lines) {
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].comment;
    if (!c) continue;
    const m = c.match(MARKER);
    if (m) items.push({ file: relPath, line: i + 1, marker: m[1], text: c.replace(/^[\s/*#]+/, "").trim().slice(0, 120) });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Exports / top-level definitions (for unused-code heuristic)
// ---------------------------------------------------------------------------
const EXPORT_DECL = /\bexport\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const EXPORT_PROP = /\b(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/;
const EXPORT_LIST = /\bexport\s*\{([^}]*)\}/;
const PY_DEF = /^def\s+([A-Za-z][\w]*)\s*\(/;
const IGNORED_EXPORTS = new Set(["default", "main", "handler", "setup", "teardown", "config", "constructor"]);
const PY_SKIP_FILES = /(?:^|\/)(?:__init__|setup|conftest|manage|wsgi|asgi|__main__)\.py$/;

function collectExports(relPath, lines, language) {
  const found = [];
  if (language === "Python") {
    if (PY_SKIP_FILES.test(relPath)) return found;
    let prevCode = "";
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].kind !== "code") continue;
      const code = lines[i].code;
      const m = code.match(PY_DEF);
      if (m && !m[1].startsWith("test") && !IGNORED_EXPORTS.has(m[1]) && !prevCode.trim().startsWith("@")) {
        found.push({ file: relPath, name: m[1], line: i + 1, language, kind: "function" });
      }
      prevCode = code;
    }
    return found;
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "code") continue;
    const code = lines[i].code;
    let m = code.match(EXPORT_DECL);
    if (m) {
      found.push({ file: relPath, name: m[1], line: i + 1, language, kind: "export" });
      continue;
    }
    m = code.match(EXPORT_PROP);
    if (m) {
      found.push({ file: relPath, name: m[1], line: i + 1, language, kind: "export" });
      continue;
    }
    m = code.match(EXPORT_LIST);
    if (m) {
      for (const part of m[1].split(",")) {
        const tokens = part.trim().split(/\s+as\s+/);
        const name = tokens[tokens.length - 1].trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) found.push({ file: relPath, name, line: i + 1, language, kind: "export" });
      }
    }
  }
  return found.filter((e) => !IGNORED_EXPORTS.has(e.name));
}

function findUnusedExports(exportsList, sourceFiles, entryFiles) {
  const candidates = exportsList.filter((e) => !entryFiles.has(e.file) && !isTestFile(e.file));
  const wanted = new Set(candidates.map((e) => e.name));
  const usage = new Map();

  for (const f of sourceFiles) {
    let text;
    try {
      text = fs.readFileSync(f.abs, "utf8");
    } catch {
      continue;
    }
    const tokenRe = /[A-Za-z_$][\w$]*/g;
    let m;
    while ((m = tokenRe.exec(text))) {
      const t = m[0];
      if (!wanted.has(t)) continue;
      let per = usage.get(t);
      if (!per) {
        per = new Map();
        usage.set(t, per);
      }
      per.set(f.path, (per.get(f.path) || 0) + 1);
    }
  }

  const unused = candidates.filter((e) => {
    const per = usage.get(e.name);
    if (!per) return true;
    for (const file of per.keys()) if (file !== e.file) return false;
    if (e.language === "Python") return (per.get(e.file) || 0) <= 1;
    return true;
  });

  return { candidates: candidates.length, unused };
}

module.exports = { isTestFile, extractTodos, collectExports, findUnusedExports };
