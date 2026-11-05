const https = require("https");

function parseGithubUrl(input) {
  const trimmed = (input || "").trim();
  const match = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:$|[#?])/
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function fetchRepoMetadata(owner, repo) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${owner}/${repo}`,
      method: "GET",
      headers: {
        "User-Agent": "github-code-analyzer",
        Accept: "application/vnd.github+json",
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 404) {
          reject(new Error("Repository not found. Check the URL and that the repo is public."));
          return;
        }
        if (res.statusCode === 403) {
          reject(new Error("GitHub API rate limit reached. Please try again shortly."));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`GitHub API error (status ${res.statusCode}).`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error("Failed to parse GitHub API response."));
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("GitHub API request timed out."));
    });
    req.end();
  });
}

module.exports = { parseGithubUrl, fetchRepoMetadata };
