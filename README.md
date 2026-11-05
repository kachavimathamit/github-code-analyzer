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

- **Overview** - file/line/function counts, a 14-category weighted scorecard (radar + bars), overall grade (A-F) and prioritized recommendations
- **Authorship & effort** - per-author commits/lines/files from git history, contribution balance, commit timeline (was the work spread out or crammed into one day), commit-message quality, and build artifacts that should have been gitignored
- **Originality** - framework scaffolding detection (CRA, Vite, Next, Django, Spring, Android, Flutter and others), **effective student-written lines** after excluding generated and template code, files never touched after their first commit, and **cross-submission overlap** against every other repository you have analyzed
- **Code quality** - language breakdown, maintainability index, cyclomatic complexity per function, function length distribution, nesting depth, comment ratio, **duplication rate**, largest/most complex files
- **Robustness** - unresolved merge conflict markers, unbalanced-delimiter (broken file) detection, swallowed errors, SQL built by string concatenation, dangerous calls (`eval`, `os.system`, `innerHTML`, disabled TLS verification), debug leftovers, commented-out code, hardcoded paths, magic numbers, long parameter lists and oversized files
- **Testing** - test-to-source code ratio (coverage proxy), detected test frameworks, CI presence
- **Security** - **hardcoded secrets scan** (masked values) and **known vulnerable dependencies** via OSV.dev
- **Dependencies** - dependency counts, outdated (major versions behind), deprecated and unpinned packages (npm + PyPI registries)
- **Architecture & completeness** - module import graph, circular imports, coupling (fan-in/fan-out), folder structure, **README quality score** and a project-completeness checklist
- **Code hygiene** - TODO/FIXME/HACK density, naming-convention consistency, potentially unused exports/functions
- **Repository health** - license, README, CI, commit activity, contributors, branches, pull requests, last push

### Notes on interpretation

- **Overlap is not proof of copying.** Cross-submission matching ignores scaffolding, but shared tutorials, common libraries and forked starters still produce matches. Treat it as a prompt to look, not a verdict.
- **Unused-code detection is a heuristic**; a library's public API can show up as unused.
- Secrets found under test paths are rated low severity so fixtures do not distort the security score.

## Requirements and limits

Only public repositories can be analyzed. Repositories are cloned with full history so authorship can be measured; repositories over ~300 MB fall back to a shallow clone and the dashboard says so.

Each analysis makes two GitHub API calls (commit, contributor and branch counts come from the clone instead). Unauthenticated access allows about 60 calls/hour per IP, so set a `GITHUB_TOKEN` environment variable before starting the backend when grading a batch of submissions:

```bash
GITHUB_TOKEN=ghp_yourtoken npm start
```
