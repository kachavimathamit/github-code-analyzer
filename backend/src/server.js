const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const simpleGit = require("simple-git");

const { analyzeRepository } = require("./analyzer");
const { analyzeDependencies } = require("./dependencies");
const { analyzeGitHistory } = require("./gitHistory");
const { analyzeArchitecture } = require("./architecture");
const { analyzeOriginality } = require("./originality");
const { computeScores } = require("./scoring");
const { parseGithubUrl, fetchRepoMetadata, fetchRepoActivity } = require("./github");
const { saveAnalysis, getAnalysisById, listAnalyses, findSimilar, saveFingerprint } = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;
const ANALYSIS_VERSION = 3;

// Above this repository size (KB from the GitHub API) we fall back to a shallow
// clone: full history would be too slow, and authorship metrics are degraded.
const FULL_HISTORY_MAX_KB = 300000;

app.use(cors());
app.use(express.json());

function buildHealth(metadata, activity, flags, testing, authorship) {
  const pushedAt = metadata.pushed_at || null;
  const license = metadata.license && metadata.license.spdx_id && metadata.license.spdx_id !== "NOASSERTION" ? metadata.license : null;
  return {
    license: {
      present: Boolean(license) || flags.hasLicenseFile,
      spdx: license ? license.spdx_id : null,
      name: license ? license.name : null,
    },
    createdAt: metadata.created_at || null,
    pushedAt,
    daysSincePush: pushedAt ? Math.floor((Date.now() - new Date(pushedAt).getTime()) / 86400000) : null,
    archived: Boolean(metadata.archived),
    openIssues: metadata.open_issues_count ?? null,
    commits30: authorship && authorship.available ? authorship.commits30 : null,
    commits90: authorship && authorship.available ? authorship.commits90 : null,
    contributors: authorship && authorship.available ? authorship.contributorCount : null,
    branches: authorship && authorship.available ? authorship.branches : null,
    pullRequests: activity.pullRequests,
    mergeCommits: authorship && authorship.available ? authorship.mergeCommits : null,
    hasCI: flags.hasCI,
    hasReadme: flags.hasReadme,
    hasGitignore: flags.hasGitignore,
    hasTests: testing.hasTests,
    topics: metadata.topics || [],
  };
}

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
    let metadata;
    try {
      metadata = await fetchRepoMetadata(owner, repo);
    } catch (metaErr) {
      return res.status(404).json({ error: metaErr.message });
    }

    fs.mkdirSync(tempDir, { recursive: true });
    const activityPromise = fetchRepoActivity(owner, repo);

    // Full history is needed for authorship metrics; cap it for very large repos.
    const shallow = (metadata.size || 0) > FULL_HISTORY_MAX_KB;
    const cloneOptions = shallow
      ? ["--depth", "100", "--single-branch", "--no-tags"]
      : ["--single-branch", "--no-tags"];
    await simpleGit().clone(cloneUrl, tempDir, cloneOptions);
    const git = simpleGit(tempDir);

    const { manifestPaths, flags, internals, ...analysis } = analyzeRepository(tempDir);

    const [{ dependencies, vulnerabilities }, activity, authorship] = await Promise.all([
      analyzeDependencies(tempDir, manifestPaths),
      activityPromise,
      analyzeGitHistory(git, { shallow }),
    ]);

    const architecture = analyzeArchitecture(tempDir, {
      allRel: internals.allRel,
      importsByFile: internals.importsByFile,
      sourceFiles: internals.sourceFilePaths,
      envUsage: internals.envUsage,
      hasTests: analysis.testing.hasTests,
      hasCI: flags.hasCI,
      hasLicense: flags.hasLicenseFile || Boolean(metadata.license && metadata.license.spdx_id !== "NOASSERTION"),
      godFiles: internals.godFiles.slice(0, 8),
    });

    const originality = analyzeOriginality({
      allRel: internals.allRel,
      fileRecords: internals.fileRecords,
      fingerprintsByFile: internals.fingerprintsByFile,
      singleTouchFiles: authorship.available ? authorship.singleTouchFiles : [],
      repoUrl: metadata.html_url || cloneUrl,
      store: { findSimilar },
    });

    analysis.testing.frameworks = dependencies.testFrameworks;
    const health = buildHealth(metadata, activity, flags, analysis.testing, authorship);
    const scoring = computeScores({ ...analysis, dependencies, vulnerabilities, health, architecture, originality, authorship });

    const { fingerprint, ...originalityPublic } = originality;
    if (authorship.available) delete authorship.singleTouchFiles;

    const result = {
      analysisVersion: ANALYSIS_VERSION,
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
      summary: { ...analysis.summary, overallScore: scoring.overallScore, grade: scoring.grade },
      categories: scoring.categories,
      recommendations: scoring.recommendations,
      dependencies,
      vulnerabilities,
      health,
      authorship,
      architecture,
      originality: originalityPublic,
    };

    const id = saveAnalysis({
      repoUrl: result.repo.url,
      repoName: repo,
      owner,
      defaultBranch: result.repo.defaultBranch,
      stars: result.repo.stars,
      result,
    });

    if (fingerprint.length) {
      try {
        saveFingerprint(result.repo.url, fingerprint);
      } catch (err) {
        console.error("fingerprint save failed", err.message);
      }
    }

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
