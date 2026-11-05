const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const simpleGit = require("simple-git");

const { analyzeRepository } = require("./analyzer");
const { parseGithubUrl, fetchRepoMetadata } = require("./github");
const { saveAnalysis, getAnalysisById, listAnalyses } = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.post("/api/analyze", async (req, res) => {
  const { repoUrl } = req.body || {};
  const parsed = parseGithubUrl(repoUrl);

  if (!parsed) {
    return res.status(400).json({ error: "Please provide a valid GitHub repository URL, e.g. https://github.com/owner/repo" });
  }

  const { owner, repo } = parsed;
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const tempDir = path.join(os.tmpdir(), "gh-code-analyzer", crypto.randomUUID());

  try {
    let metadata = {};
    try {
      metadata = await fetchRepoMetadata(owner, repo);
    } catch (metaErr) {
      return res.status(404).json({ error: metaErr.message });
    }

    fs.mkdirSync(tempDir, { recursive: true });

    const git = simpleGit();
    await git.clone(cloneUrl, tempDir, ["--depth", "1", "--single-branch"]);

    const analysis = analyzeRepository(tempDir);

    const result = {
      repo: {
        owner,
        name: repo,
        fullName: metadata.full_name || `${owner}/${repo}`,
        description: metadata.description || "",
        stars: metadata.stargazers_count ?? 0,
        forks: metadata.forks_count ?? 0,
        defaultBranch: metadata.default_branch || "main",
        language: metadata.language || null,
        url: metadata.html_url || `https://github.com/${owner}/${repo}`,
      },
      ...analysis,
    };

    const id = saveAnalysis({
      repoUrl: result.repo.url,
      repoName: repo,
      owner,
      defaultBranch: result.repo.defaultBranch,
      stars: result.repo.stars,
      result,
    });

    res.json({ id, ...result });
  } catch (err) {
    console.error(err);
    const message =
      err.message && err.message.includes("not found")
        ? "Repository not found or is private. Only public repositories can be analyzed."
        : "Failed to analyze repository. " + (err.message || "");
    res.status(500).json({ error: message });
  } finally {
    fs.rm(tempDir, { recursive: true, force: true }, () => {});
  }
});

app.get("/api/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  res.json(listAnalyses(limit));
});

app.get("/api/analyze/:id", (req, res) => {
  const row = getAnalysisById(req.params.id);
  if (!row) return res.status(404).json({ error: "Analysis not found." });
  res.json({ id: row.id, ...row.result });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`GitHub Code Analyzer backend running on http://localhost:${PORT}`);
});
