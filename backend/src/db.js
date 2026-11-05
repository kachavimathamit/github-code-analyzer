const path = require("path");
const Database = require("better-sqlite3");

const dbPath = path.join(__dirname, "..", "data.sqlite");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_url TEXT NOT NULL,
    repo_name TEXT,
    owner TEXT,
    default_branch TEXT,
    stars INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    result_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fingerprints (
    repo_url TEXT NOT NULL,
    hash INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON fingerprints(hash);
  CREATE INDEX IF NOT EXISTS idx_fingerprints_repo ON fingerprints(repo_url);
`);

const CHUNK = 800;

function saveAnalysis({ repoUrl, repoName, owner, defaultBranch, stars, result }) {
  const stmt = db.prepare(`
    INSERT INTO analyses (repo_url, repo_name, owner, default_branch, stars, result_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(repoUrl, repoName, owner, defaultBranch, stars ?? 0, JSON.stringify(result));
  return info.lastInsertRowid;
}

function getAnalysisById(id) {
  const row = db.prepare("SELECT * FROM analyses WHERE id = ?").get(id);
  if (!row) return null;
  return { ...row, result: JSON.parse(row.result_json) };
}

function listAnalyses(limit = 20) {
  return db
    .prepare("SELECT id, repo_url, repo_name, owner, stars, created_at FROM analyses ORDER BY id DESC LIMIT ?")
    .all(limit);
}

// Counts how many of this submission's code blocks also appear in each other
// repository that has been analyzed before.
function findSimilar(hashes, repoUrl) {
  const totals = new Map(
    db.prepare("SELECT repo_url, COUNT(*) AS total FROM fingerprints WHERE repo_url != ? GROUP BY repo_url").all(repoUrl).map((r) => [r.repo_url, r.total])
  );
  if (totals.size === 0) return [];

  const shared = new Map();
  for (let i = 0; i < hashes.length; i += CHUNK) {
    const slice = hashes.slice(i, i + CHUNK);
    const placeholders = slice.map(() => "?").join(",");
    const rows = db
      .prepare(`SELECT repo_url, COUNT(DISTINCT hash) AS n FROM fingerprints WHERE repo_url != ? AND hash IN (${placeholders}) GROUP BY repo_url`)
      .all(repoUrl, ...slice);
    for (const r of rows) shared.set(r.repo_url, (shared.get(r.repo_url) || 0) + r.n);
  }

  const names = new Map(
    db.prepare("SELECT repo_url, MAX(created_at) AS created_at, owner, repo_name FROM analyses GROUP BY repo_url").all().map((r) => [r.repo_url, r])
  );

  return [...shared.entries()]
    .map(([url, n]) => {
      const meta = names.get(url) || {};
      // Two different questions, both useful to a grader: how much of THIS
      // submission appears elsewhere, and how much of the OTHER one is here.
      const similarityPercent = Math.round((n / Math.max(1, hashes.length)) * 1000) / 10;
      const coveragePercent = Math.round((n / Math.max(1, totals.get(url) || 0)) * 1000) / 10;
      return {
        repoUrl: url,
        fullName: meta.owner && meta.repo_name ? `${meta.owner}/${meta.repo_name}` : url,
        analyzedAt: meta.created_at || null,
        sharedBlocks: n,
        ownBlocks: hashes.length,
        otherBlocks: totals.get(url) || 0,
        similarityPercent,
        coveragePercent,
        peakPercent: Math.max(similarityPercent, coveragePercent),
      };
    })
    .filter((m) => m.peakPercent >= 8 && m.sharedBlocks >= 10)
    .sort((a, b) => b.peakPercent - a.peakPercent)
    .slice(0, 10);
}

function saveFingerprint(repoUrl, hashes) {
  const del = db.prepare("DELETE FROM fingerprints WHERE repo_url = ?");
  const ins = db.prepare("INSERT INTO fingerprints (repo_url, hash) VALUES (?, ?)");
  db.transaction(() => {
    del.run(repoUrl);
    for (const h of hashes) ins.run(repoUrl, h);
  })();
}

module.exports = { db, saveAnalysis, getAnalysisById, listAnalyses, findSimilar, saveFingerprint };
