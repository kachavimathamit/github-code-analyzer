// Lightweight, dependency-free static analysis: line classification, function
// extraction, cyclomatic complexity, nesting depth and identifier naming.

const HASH_LANGS = new Set(["Python", "Ruby", "Shell"]);
const INDENT_LANGS = new Set(["Python", "Ruby"]);

const CONTROL_BRACE = /^\s*(?:\}\s*)*(?:else\s+if|if|for|foreach|while|switch|try|catch|finally|do|else|loop|match|select)\b/;
const CONTROL_PY = /^\s*(?:if|elif|else|for|while|try|except|finally|with|match|case)\b/;
const CONTROL_RB = /^\s*(?:if|elsif|else|unless|while|until|for|case|when|begin|rescue|ensure)\b/;

const DECISION_RE = {
  brace: /\b(?:if|for|foreach|while|case|catch)\b|&&|\|\||\?\?|\s\?\s/g,
  Python: /\b(?:if|elif|for|while|except|and|or|case)\b/g,
  Ruby: /\b(?:if|elsif|unless|while|until|for|when|rescue|and|or)\b|&&|\|\|/g,
};

const NOT_FUNCTION_NAMES = new Set([
  "if", "for", "while", "switch", "catch", "function", "return", "else", "with", "do", "try", "foreach", "new", "throw", "case", "delete", "typeof", "await", "yield",
]);

// ---------------------------------------------------------------------------
// Line preprocessing: strips comments and string contents so later regexes work
// on code only.
// ---------------------------------------------------------------------------
function preprocess(content, language) {
  const raw = content.split(/\r\n|\r|\n/);
  const hashStyle = HASH_LANGS.has(language);
  const allowTriple = language === "Python";
  let inBlock = false;
  let tripleQuote = null;
  const out = new Array(raw.length);

  for (let li = 0; li < raw.length; li++) {
    const line = raw[li];
    if (line.trim() === "") {
      out[li] = { kind: "blank", code: "", comment: "" };
      continue;
    }
    let code = "";
    let comment = "";
    let quote = null;
    let i = 0;
    const n = line.length;

    while (i < n) {
      if (tripleQuote) {
        const end = line.indexOf(tripleQuote, i);
        if (end === -1) {
          comment += line.slice(i);
          i = n;
        } else {
          comment += line.slice(i, end + 3);
          i = end + 3;
          tripleQuote = null;
        }
        continue;
      }
      if (inBlock) {
        const end = line.indexOf("*/", i);
        if (end === -1) {
          comment += line.slice(i);
          i = n;
        } else {
          comment += line.slice(i, end + 2);
          i = end + 2;
          inBlock = false;
        }
        continue;
      }
      const ch = line[i];
      if (quote) {
        if (ch === "\\") {
          i += 2;
          continue;
        }
        if (ch === quote) quote = null;
        i++;
        continue;
      }
      if (allowTriple && (line.startsWith('"""', i) || line.startsWith("'''", i))) {
        tripleQuote = line.substr(i, 3);
        comment += tripleQuote;
        i += 3;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        code += '""';
        i++;
        continue;
      }
      if (hashStyle) {
        if (ch === "#") {
          comment += line.slice(i);
          break;
        }
      } else if (ch === "/") {
        const next = line[i + 1];
        if (next === "/") {
          comment += line.slice(i);
          break;
        }
        if (next === "*") {
          inBlock = true;
          comment += "/*";
          i += 2;
          continue;
        }
      }
      code += ch;
      i++;
    }

    const kind = code.trim() ? "code" : comment.trim() ? "comment" : "blank";
    out[li] = { kind, code, comment };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Function detection
// ---------------------------------------------------------------------------
const JS_METHOD = /^\s*(?:(?:static|async|get|set|public|private|protected|readonly|override)\s+)*\*?\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{=]+)?\{\s*$/;
const JS_FUNCTION = /\bfunction\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*(?:<[^>]*>)?\s*\(/;
const JS_ASSIGNED_NAME = /([A-Za-z_$][\w$.]*)\s*(?::[^=]+)?[:=]\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/;
const IIFE_START = /^\s*[;!(]\s*\(?\s*(?:async\s+)?function\b/;
const C_METHOD = /^\s*(?:(?:public|private|protected|static|final|abstract|virtual|override|async|inline|extern|const|unsigned|signed|synchronized|internal|sealed|partial|friend|explicit)\s+)*[\w:<>\[\],.*&?]+(?:\s+|\s*[*&]+\s*)([A-Za-z_~][\w]*)\s*\([^;]*\)\s*(?:const\s*)?(?:throws\s+[\w.,\s]+)?(?:\s*override)?\s*\{?\s*$/;

const SIMPLE_DETECTORS = {
  Go: /^\s*func\b\s*(?:\([^)]*\)\s*)?([A-Za-z_]\w*)?/,
  Rust: /\bfn\s+([A-Za-z_]\w*)/,
  Kotlin: /\bfun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?([A-Za-z_]\w*)/,
  Swift: /\bfunc\s+([A-Za-z_]\w*)/,
  PHP: /\bfunction\s+&?([A-Za-z_]\w*)/,
};

function detectBraceFunction(lines, i, language) {
  const code = lines[i].code;
  if (language === "JavaScript" || language === "TypeScript") {
    if (JS_FUNCTION.test(code)) {
      const m = code.match(JS_FUNCTION);
      let name = m[1];
      if (!name) {
        const a = code.match(JS_ASSIGNED_NAME);
        name = a ? a[1] : "<anonymous>";
      }
      return { name, arrow: false, iife: IIFE_START.test(code) && !m[1] };
    }
    if (/=>\s*\{/.test(code)) {
      const a = code.match(JS_ASSIGNED_NAME);
      return { name: a ? a[1] : "<callback>", arrow: true, iife: false };
    }
    if (/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=>]+)?=>/.test(code)) {
      const a = code.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
      return { name: a ? a[1] : "<arrow>", arrow: true, iife: false };
    }
    const m = code.match(JS_METHOD);
    if (m && !NOT_FUNCTION_NAMES.has(m[1])) return { name: m[1], arrow: false, iife: false };
    return null;
  }
  if (SIMPLE_DETECTORS[language]) {
    const m = code.match(SIMPLE_DETECTORS[language]);
    if (m) return { name: m[1] || "<anonymous>", arrow: false, iife: false };
    return null;
  }
  if (language === "Java" || language === "C#" || language === "C" || language === "C++") {
    if (/^\s*(?:return|else|new|throw|case|delete|using|namespace|typedef)\b/.test(code)) return null;
    const m = code.match(C_METHOD);
    if (!m || NOT_FUNCTION_NAMES.has(m[1])) return null;
    const hasBrace = /\{\s*$/.test(code) || (lines[i + 1] && lines[i + 1].code.trim().startsWith("{"));
    if (!hasBrace) return null;
    return { name: m[1], arrow: false, iife: false };
  }
  return null;
}

function findBraceEnd(lines, idx, arrow) {
  const limit = Math.min(lines.length, idx + 15);
  let startLine = -1;
  let startCol = -1;

  if (arrow) {
    const a = lines[idx].code.indexOf("=>");
    let li = idx;
    let col = a >= 0 ? a + 2 : 0;
    while (li < limit) {
      const text = lines[li].code;
      while (col < text.length && /\s/.test(text[col])) col++;
      if (col < text.length) {
        if (text[col] === "{") {
          startLine = li;
          startCol = col;
        }
        break;
      }
      li++;
      col = 0;
    }
    if (startLine === -1) return idx;
  } else {
    let depthParen = 0;
    let seenParen = false;
    outer: for (let li = idx; li < limit; li++) {
      const text = lines[li].code;
      for (let c = 0; c < text.length; c++) {
        const ch = text[c];
        if (ch === "(") {
          depthParen++;
          seenParen = true;
        } else if (ch === ")") {
          depthParen--;
        } else if (seenParen && depthParen <= 0) {
          if (ch === "{") {
            startLine = li;
            startCol = c;
            break outer;
          }
          if (ch === ";") return -1;
        }
      }
    }
    if (startLine === -1) return -1;
  }

  let depth = 0;
  for (let l = startLine; l < lines.length; l++) {
    const text = lines[l].code;
    for (let c = l === startLine ? startCol : 0; c < text.length; c++) {
      if (text[c] === "{") depth++;
      else if (text[c] === "}") {
        depth--;
        if (depth === 0) return l;
      }
    }
  }
  return lines.length - 1;
}

function indentOf(text) {
  let n = 0;
  for (const ch of text) {
    if (ch === " ") n++;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
}

function extractIndentFunctions(lines, language) {
  const defRe = language === "Python" ? /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/ : /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/;
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "code") continue;
    const m = lines[i].code.match(defRe);
    if (!m) continue;
    const indent = indentOf(lines[i].code);
    let last = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].kind !== "code") continue;
      const ind = indentOf(lines[j].code);
      if (ind <= indent) {
        if (language === "Ruby" && ind === indent && lines[j].code.trim() === "end") last = j;
        break;
      }
      last = j;
    }
    result.push({ name: m[1], start: i, end: last, iife: false });
  }
  return result;
}

function extractFunctions(lines, language) {
  if (INDENT_LANGS.has(language)) return extractIndentFunctions(lines, language);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "code") continue;
    const det = detectBraceFunction(lines, i, language);
    if (!det) continue;
    const end = findBraceEnd(lines, i, det.arrow);
    if (end < i) continue;
    result.push({ name: det.name, start: i, end, iife: det.iife });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Decision points & nesting depth
// ---------------------------------------------------------------------------
function countDecisions(lines, language) {
  const re = DECISION_RE[language] || DECISION_RE.brace;
  const out = new Array(lines.length).fill(0);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "code") continue;
    const m = lines[i].code.match(re);
    out[i] = m ? m.length : 0;
  }
  return out;
}

function computeDepth(lines, language) {
  const depth = new Array(lines.length).fill(0);

  if (INDENT_LANGS.has(language)) {
    const control = language === "Python" ? CONTROL_PY : CONTROL_RB;
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].kind !== "code") {
        depth[i] = stack.length;
        continue;
      }
      const ind = indentOf(lines[i].code);
      const isControl = control.test(lines[i].code);
      while (stack.length && stack[stack.length - 1] >= ind) stack.pop();
      depth[i] = stack.length + (isControl ? 1 : 0);
      if (isControl) stack.push(ind);
    }
    return depth;
  }

  const stack = [];
  let ctrl = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "code") {
      depth[i] = ctrl;
      continue;
    }
    const code = lines[i].code;
    let k = 0;
    while (k < code.length && (code[k] === "}" || code[k] === " " || code[k] === "\t")) {
      if (code[k] === "}") {
        if (stack.pop()) ctrl--;
      }
      k++;
    }
    const startsControl = CONTROL_BRACE.test(code);
    depth[i] = ctrl + (startsControl ? 1 : 0);
    let usedFirst = false;
    for (; k < code.length; k++) {
      const ch = code[k];
      if (ch === "{") {
        const isCtrl = startsControl && !usedFirst;
        usedFirst = true;
        stack.push(isCtrl);
        if (isCtrl) ctrl++;
      } else if (ch === "}") {
        if (stack.pop()) ctrl--;
      }
    }
  }
  return depth;
}

// Attribute decisions/nesting to the innermost enclosing function and compute
// per-function metrics.
function computeFunctionMetrics(lines, language) {
  const functions = extractFunctions(lines, language);
  const decisions = countDecisions(lines, language);
  const depth = computeDepth(lines, language);

  functions.sort((a, b) => a.start - b.start || b.end - a.end);
  for (const f of functions) {
    f.decisions = 0;
    f.maxDepth = depth[f.start];
  }

  const stack = [];
  let fi = 0;
  for (let i = 0; i < lines.length; i++) {
    while (stack.length && stack[stack.length - 1].end < i) stack.pop();
    while (fi < functions.length && functions[fi].start === i) stack.push(functions[fi++]);
    if (lines[i].kind !== "code" || !stack.length) continue;
    const top = stack[stack.length - 1];
    top.decisions += decisions[i];
    if (depth[i] > top.maxDepth) top.maxDepth = depth[i];
  }

  let fileDecisions = 0;
  let deepest = 0;
  for (let i = 0; i < lines.length; i++) {
    fileDecisions += decisions[i];
    if (depth[i] > deepest) deepest = depth[i];
  }

  return {
    functions: functions.map((f) => ({
      name: f.name,
      line: f.start + 1,
      length: f.end - f.start + 1,
      complexity: 1 + f.decisions,
      nesting: Math.max(0, f.maxDepth - depth[f.start]),
      iife: f.iife,
    })),
    fileDecisions,
    deepestNesting: deepest,
  };
}

// ---------------------------------------------------------------------------
// Naming conventions
// ---------------------------------------------------------------------------
const NAME_DECL = /\b(?:const|let|var|val|function|def|func|fn|fun|int|long|short|double|float|bool|boolean|char|string|String|auto)\s+\*?([A-Za-z_$][\w$]*)/g;
const PY_ASSIGN = /^\s*([A-Za-z_]\w*)\s*=[^=]/;

const ALLOWED_SHORT = new Set(["i", "j", "k", "x", "y", "z", "n", "m", "e", "_", "id", "io", "fs", "db", "ok", "el", "fn", "cb", "pi", "os", "vm", "ui", "tx", "rx", "up", "to", "no"]);

function classifyName(raw) {
  const name = raw.replace(/^[_$]+/, "");
  if (!name) return null;
  if (/^[A-Z][A-Z0-9_]*$/.test(name) && name.length > 1) return "constant";
  if (/^[A-Z]/.test(name)) return "pascal";
  if (name.includes("_") && name === name.toLowerCase()) return "snake";
  if (/^[a-z][a-z0-9]*[A-Z]/.test(name)) return "camel";
  return "neutral";
}

function analyzeNaming(lines, language) {
  const counts = { camel: 0, snake: 0, pascal: 0, constant: 0, neutral: 0, short: 0, total: 0 };
  const shortNames = {};
  for (const line of lines) {
    if (line.kind !== "code") continue;
    const found = [];
    let m;
    NAME_DECL.lastIndex = 0;
    while ((m = NAME_DECL.exec(line.code))) found.push(m[1]);
    if (language === "Python") {
      const a = line.code.match(PY_ASSIGN);
      if (a) found.push(a[1]);
    }
    for (const name of found) {
      const cls = classifyName(name);
      if (!cls) continue;
      counts.total++;
      counts[cls]++;
      const bare = name.replace(/^[_$]+/, "");
      if (bare.length <= 2 && !ALLOWED_SHORT.has(bare.toLowerCase())) {
        counts.short++;
        shortNames[bare] = (shortNames[bare] || 0) + 1;
      }
    }
  }
  return { counts, shortNames };
}

module.exports = { preprocess, computeFunctionMetrics, analyzeNaming };
