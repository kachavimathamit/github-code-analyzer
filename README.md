# GitHub Code Analyzer

Paste a public GitHub repository URL and get instant code quality metrics: lines of code, language breakdown, cyclomatic complexity, comment ratio, maintainability index, and an overall grade.

## Stack

- **Backend:** Node.js + Express, `simple-git` (shallow clone), `better-sqlite3` for persistence
- **Frontend:** React (Vite) + Recharts
- **DB:** SQLite (`backend/data.sqlite`), auto-created on first run

## How it works

1. Paste a GitHub repo URL in the text field and click **Analyze**.
2. The backend fetches repo metadata from the GitHub API, shallow-clones the repo to a temp folder, walks every source file, and computes metrics per file and in aggregate.
3. Results are saved to SQLite and shown as a dashboard: overall score/grade, stat cards, language charts, largest files, and most complex files.
4. Past analyses are listed in the sidebar and can be reopened without re-cloning.

## Setup

```bash
cd backend
npm install
npm start
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). The frontend proxies `/api/*` to the backend on port 4000.

## Metrics computed

- Total/analyzed/skipped files, total bytes
- Total, code, comment, and blank lines
- Language breakdown (by extension) with per-language line/file counts
- Function count (regex-based, per common languages)
- Cyclomatic complexity (decision-point count) per file and averaged
- Comment ratio
- Maintainability index (0–100, Microsoft-style approximation)
- Overall quality score (0–100) and letter grade (A–F)
- Top 10 largest files, top 10 most complex files

Only public repositories can be analyzed (no auth token is used, so GitHub API rate limits apply: ~60 requests/hour per IP).
