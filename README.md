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

All results appear in the dashboard, grouped into sections:

- **Overview** - file/line/function counts, a 10-category weighted scorecard (radar + bars), overall grade (A-F) and prioritized recommendations
- **Code quality** - language breakdown, maintainability index, cyclomatic complexity per function, function length distribution, max nesting depth per function, comment ratio, **duplication rate** (copy-paste detection), largest/most complex files
- **Testing** - test-to-source code ratio (coverage proxy), detected test frameworks, CI presence
- **Security** - **hardcoded secrets scan** (masked values) and **known vulnerable dependencies** via OSV.dev
- **Dependencies** - dependency counts, outdated (major versions behind), deprecated and unpinned packages (npm + PyPI registries; package.json and requirements.txt)
- **Code hygiene** - TODO/FIXME/HACK density, naming-convention consistency and very short names, potentially unused exports/functions (heuristic)
- **Repository health** - license, README, CI, commit activity (30/90 days), contributors, last push

Only public repositories can be analyzed. GitHub API calls are unauthenticated by default (about 60 requests/hour per IP); set a `GITHUB_TOKEN` environment variable before starting the backend to raise the limit.
