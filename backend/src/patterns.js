// Robustness / code-smell scanner. Works on raw lines (for string content) plus
// the preprocessed lines (to know which lines are comments or code).

const BRACE_LANGS = new Set(["JavaScript", "TypeScript", "Java", "C", "C++", "C#", "Go", "Rust", "Swift", "Kotlin", "PHP"]);

const SQL_KEYWORD = /\b(?:SELECT\s+[\w*]|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|DROP\s+TABLE\b|CREATE\s+TABLE\b)/i;
const SQL_CONCAT = /["'`]\s*\+|\+\s*["'`]|\$\{[^}]+\}|%s|%\(|\bf["']|\.format\s*\(/;

const DANGEROUS = [
  { re: /\beval\s*\(/, label: "eval()", severity: "high" },
  { re: /\bnew\s+Function\s*\(/, label: "new Function()", severity: "high" },
  { re: /\bos\.system\s*\(/, label: "os.system()", severity: "high" },
  { re: /\bsubprocess\.[A-Za-z_]+\([^)]*shell\s*=\s*True/, label: "subprocess(shell=True)", severity: "high" },
  { re: /\bchild_process\.exec\s*\(|\bexecSync\s*\(/, label: "child_process.exec()", severity: "medium" },
  { re: /\.innerHTML\s*=/, label: "innerHTML assignment", severity: "medium" },
  { re: /\bdocument\.write\s*\(/, label: "document.write()", severity: "medium" },
  { re: /\bpickle\.loads?\s*\(/, label: "pickle.load()", severity: "medium" },
  { re: /\byaml\.load\s*\((?![^)]*SafeLoader)/, label: "yaml.load() without SafeLoader", severity: "medium" },
  { re: /\bMD5\s*\(|\bmd5\s*\(|hashlib\.md5|\bsha1\s*\(/, label: "weak hash (MD5/SHA1)", severity: "low" },
  { re: /verify\s*=\s*False|rejectUnauthorized:\s*false/, label: "TLS verification disabled", severity: "high" },
];

const DEBUG = [
  { re: /\bconsole\.(?:log|debug|dir|trace)\s*\(/, label: "console.log" },
  { re: /^\s*debugger\s*;?\s*$/, label: "debugger" },
  { re: /\bSystem\.out\.print(?:ln)?\s*\(/, label: "System.out.println" },
  { re: /\bvar_dump\s*\(|\bprint_r\s*\(/, label: "var_dump" },
  { re: /\bfmt\.Print(?:ln|f)?\s*\(/, label: "fmt.Println" },
];

const PY_DEBUG = /^\s*print\s*\(/;
// Folders whose whole purpose is to demonstrate or script something, and Python
// entry points where printing is the program's actual output.
const ILLUSTRATIVE_PATH = /^(?:examples?|samples?|demos?|docs?|scripts?|tools?|benchmarks?)\//i;
const PY_ENTRY_POINT = /(?:^|\/)(?:main|__main__|app|manage|run|cli|server|bot)\.py$/i;

const HARDCODED_PATH = /(?:[A-Za-z]:\\\\?(?:Users|Documents|Desktop|home)|\/(?:home|Users)\/[A-Za-z0-9._-]+\/)/;
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/;

const COMMENTED_CODE = /(?:;\s*$|\{\s*$|\}\s*$|^\s*(?:if|for|while|return|def|function|const|let|var|class|import|print|console)\b.*[();{]|=\s*[^=].*;)/;
const MAGIC_NUMBER = /(?<![\w.])\d{2,}(?![\w.])/g;
const MAGIC_EXEMPT = new Set(["10", "12", "16", "24", "32", "60", "64", "100", "1000", "1024", "200", "201", "204", "400", "401", "403", "404", "500", "255", "360", "180", "99", "50"]);
const CONST_DECL = /\b(?:const|final|static|#define|readonly|val)\b|^[A-Z0-9_]+\s*=/;

const CONFIG_FILE = /(?:config|settings|constants|env|example|sample|docker-compose|\.test\.|\.spec\.)/i;

function isEmptyBody(rawLines, startIdx, kinds) {
  // Looks at the lines after an opening brace to decide whether the block is empty.
  for (let i = startIdx; i < Math.min(rawLines.length, startIdx + 6); i++) {
    const t = rawLines[i].trim();
    if (!t) continue;
    if (kinds[i] === "comment") continue;
    return t === "}" || t === "};";
  }
  return false;
}

function scanPatterns(relPath, rawLines, lines, language, isTest) {
  const findings = [];
  const kinds = lines.map((l) => l.kind);
  const isConfig = CONFIG_FILE.test(relPath);
  const push = (line, type, label, severity, snippet) => {
    if (findings.length < 400) findings.push({ file: relPath, line: line + 1, type, label, severity, snippet: snippet.trim().slice(0, 120) });
  };

  let commentRun = 0;
  let commentRunStart = 0;
  let magicNumbers = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const kind = kinds[i];

    // Merge conflict markers are checked on every line, comments included.
    if (/^(?:<{7}|>{7})(?:\s|$)/.test(rawLine)) {
      push(i, "merge-conflict", "Unresolved merge conflict marker", "high", rawLine);
      continue;
    }

    if (kind === "comment") {
      const body = lines[i].comment.replace(/^[\s/*#-]+/, "");
      if (body.length > 6 && COMMENTED_CODE.test(body)) {
        if (commentRun === 0) commentRunStart = i;
        commentRun++;
      } else {
        commentRun = 0;
      }
      if (commentRun === 3) push(commentRunStart, "commented-code", "Block of commented-out code", "low", lines[commentRunStart].comment);
      continue;
    }
    commentRun = 0;
    if (kind !== "code") continue;

    const code = lines[i].code;

    // Empty / swallowed error handling
    if (language === "Python" || language === "Ruby") {
      if (/^\s*except\s*:/.test(code)) push(i, "swallowed-error", "Bare except:", "medium", rawLine);
      else if (/^\s*except\b/.test(code)) {
        const next = (rawLines[i + 1] || "").trim();
        if (next === "pass") push(i, "swallowed-error", "except block that only passes", "medium", rawLine);
      }
    } else if (BRACE_LANGS.has(language) && /\bcatch\b/.test(code)) {
      if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(code)) push(i, "swallowed-error", "Empty catch block", "medium", rawLine);
      else if (/catch\s*(?:\([^)]*\))?\s*\{\s*$/.test(code) && isEmptyBody(rawLines, i + 1, kinds)) {
        push(i, "swallowed-error", "Empty catch block", "medium", rawLine);
      }
    }

    // Debug leftovers (checked on stripped code so matches inside strings are ignored)
    if (!isTest && !ILLUSTRATIVE_PATH.test(relPath)) {
      if (language === "Python" && !PY_ENTRY_POINT.test(relPath)) {
        if (PY_DEBUG.test(code)) push(i, "debug-statement", "print()", "low", rawLine);
      }
      for (const d of DEBUG) {
        if (d.re.test(code)) {
          push(i, "debug-statement", d.label, "low", rawLine);
          break;
        }
      }
    }

    // SQL built by concatenation / interpolation
    if (SQL_KEYWORD.test(rawLine) && SQL_CONCAT.test(rawLine) && !/^\s*(?:--|\/\/)/.test(rawLine)) {
      push(i, "sql-injection", "SQL query built from string concatenation", "high", rawLine);
    }

    // Dangerous calls (stripped code: an eval() inside a string is not a call)
    for (const d of DANGEROUS) {
      if (d.re.test(code)) {
        push(i, "dangerous-call", d.label, d.severity, rawLine);
        break;
      }
    }

    // Environment assumptions
    if (HARDCODED_PATH.test(rawLine)) push(i, "hardcoded-path", "Absolute filesystem path", "medium", rawLine);
    else if (!isConfig && !isTest && LOCAL_URL.test(rawLine)) push(i, "hardcoded-url", "Hardcoded localhost URL", "low", rawLine);

    // Magic numbers
    if (!CONST_DECL.test(code)) {
      const found = code.match(MAGIC_NUMBER);
      if (found) for (const n of found) if (!MAGIC_EXEMPT.has(n)) magicNumbers++;
    }
  }

  return { findings, magicNumbers };
}

// A "/" starts a regex literal (rather than division) only in these positions.
const REGEX_AFTER_CHAR = /[(,=:[!&|?{};+\-*%~^<>]$/;
const REGEX_AFTER_WORD = /\b(?:return|typeof|instanceof|in|of|new|delete|void|throw|do|else|yield|await|case)$/;

// Balanced-delimiter check on preprocessed code (strings and comments removed).
// Regex literals are skipped, since /\{/ would otherwise look unbalanced.
function checkStructure(relPath, lines, language) {
  const jsLike = language === "JavaScript" || language === "TypeScript";
  let round = 0;
  let curly = 0;
  let square = 0;
  let tail = "";

  for (const l of lines) {
    if (l.kind !== "code") continue;
    const text = l.code;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (jsLike && ch === "/") {
        const trimmed = tail.trimEnd();
        const atRegexStart = trimmed === "" || REGEX_AFTER_CHAR.test(trimmed) || REGEX_AFTER_WORD.test(trimmed);
        if (atRegexStart) {
          let j = i + 1;
          let inClass = false;
          let closed = false;
          for (; j < text.length; j++) {
            const c = text[j];
            if (c === "\\") {
              j++;
              continue;
            }
            if (c === "[") inClass = true;
            else if (c === "]") inClass = false;
            else if (c === "/" && !inClass) {
              closed = true;
              break;
            }
          }
          if (closed) {
            i = j;
            tail = "/";
            continue;
          }
        }
      }

      if (ch === "(") round++;
      else if (ch === ")") round--;
      else if (ch === "{") curly++;
      else if (ch === "}") curly--;
      else if (ch === "[") square++;
      else if (ch === "]") square--;
      tail = (tail + ch).slice(-14);
    }
    tail = (tail + " ").slice(-14);
  }
  const issues = [];
  if (round !== 0) issues.push(`${Math.abs(round)} unbalanced parenthes${Math.abs(round) === 1 ? "is" : "es"}`);
  if (curly !== 0) issues.push(`${Math.abs(curly)} unbalanced brace${Math.abs(curly) === 1 ? "" : "s"}`);
  if (square !== 0) issues.push(`${Math.abs(square)} unbalanced bracket${Math.abs(square) === 1 ? "" : "s"}`);
  return issues.length ? { file: relPath, issues: issues.join(", ") } : null;
}

const PATTERN_LABELS = {
  "merge-conflict": "Unresolved merge conflicts",
  "sql-injection": "SQL built by string concatenation",
  "dangerous-call": "Dangerous function calls",
  "swallowed-error": "Swallowed errors",
  "hardcoded-path": "Hardcoded absolute paths",
  "hardcoded-url": "Hardcoded localhost URLs",
  "debug-statement": "Debug statements left in code",
  "commented-code": "Commented-out code blocks",
};

function summarizeFindings(all, structural, extras) {
  const byType = new Map();
  for (const f of all) {
    const g = byType.get(f.type) || { type: f.type, label: PATTERN_LABELS[f.type] || f.type, count: 0, severity: f.severity, files: new Set(), samples: [] };
    g.count++;
    g.files.add(f.file);
    if (g.samples.length < 5) g.samples.push(f);
    if (f.severity === "high") g.severity = "high";
    else if (f.severity === "medium" && g.severity === "low") g.severity = "medium";
    byType.set(f.type, g);
  }

  const rank = { high: 0, medium: 1, low: 2 };
  const groups = [...byType.values()]
    .map((g) => ({ ...g, files: g.files.size }))
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count);

  return {
    totalFindings: all.length,
    high: all.filter((f) => f.severity === "high").length,
    medium: all.filter((f) => f.severity === "medium").length,
    low: all.filter((f) => f.severity === "low").length,
    groups,
    structuralIssues: structural.slice(0, 10),
    structuralCount: structural.length,
    ...extras,
  };
}

module.exports = { scanPatterns, checkStructure, summarizeFindings };
