// Copy-paste detection: hashes sliding windows of normalized code lines and
// reports lines that belong to a window seen more than once across the repo.

const WINDOW = 6;

function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const IGNORE_LINE = /^(?:import|from|#include|using|package|use|export\s*\{|export\s*\*)\b|\brequire\s*\(/;

function normalizeCodeLines(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "code") continue;
    const text = lines[i].code.trim().replace(/\s+/g, " ");
    if (text.length < 10 || text.length > 300) continue;
    if (/^[\W_]+$/.test(text) || IGNORE_LINE.test(text)) continue;
    out.push({ no: i + 1, text });
  }
  return out;
}

// Deterministic 1-in-4 sample of window hashes, kept per file so cross-repo
// comparison can skip boilerplate files later.
const SAMPLE_MASK = 3;

class DuplicationDetector {
  constructor() {
    this.seen = new Map();
    this.files = [];
    this.fingerprints = new Map();
  }

  addFile(path, lines) {
    const idx = this.files.length;
    const rec = { path, total: lines.length, dup: new Set() };
    this.files.push(rec);
    const sampled = [];

    for (let s = 0; s + WINDOW <= lines.length; s++) {
      let joined = "";
      for (let k = 0; k < WINDOW; k++) joined += lines[s + k].text + "\n";
      const key = cyrb53(joined);
      if (key % SAMPLE_MASK === 0 && sampled.length < 400) sampled.push(key);
      const prev = this.seen.get(key);
      if (prev === undefined) {
        this.seen.set(key, { file: idx, pos: s, marked: false });
        continue;
      }
      if (prev.file === idx && Math.abs(prev.pos - s) < WINDOW) continue;
      for (let k = 0; k < WINDOW; k++) rec.dup.add(s + k);
      if (!prev.marked) {
        prev.marked = true;
        const other = this.files[prev.file];
        for (let k = 0; k < WINDOW; k++) other.dup.add(prev.pos + k);
      }
    }
    if (sampled.length) this.fingerprints.set(path, sampled);
  }

  result() {
    let total = 0;
    let dup = 0;
    for (const f of this.files) {
      total += f.total;
      dup += f.dup.size;
    }
    const topFiles = this.files
      .filter((f) => f.dup.size >= 6)
      .map((f) => ({
        path: f.path,
        duplicatedLines: f.dup.size,
        percent: f.total ? Math.round((f.dup.size / f.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.duplicatedLines - a.duplicatedLines)
      .slice(0, 10);
    return {
      analyzedLines: total,
      duplicatedLines: dup,
      duplicationPercent: total ? Math.round((dup / total) * 1000) / 10 : 0,
      filesWithDuplication: this.files.filter((f) => f.dup.size >= 6).length,
      windowSize: WINDOW,
      topFiles,
    };
  }
}

module.exports = { DuplicationDetector, normalizeCodeLines };
