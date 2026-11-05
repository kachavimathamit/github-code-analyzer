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
`);

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
  const rows = db
    .prepare("SELECT id, repo_url, repo_name, owner, stars, created_at FROM analyses ORDER BY id DESC LIMIT ?")
    .all(limit);
  return rows;
}

module.exports = { db, saveAnalysis, getAnalysisById, listAnalyses };
