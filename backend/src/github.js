const API = "https://api.github.com";

function parseGithubUrl(input) {
  const trimmed = (input || "").trim();
  const match = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?(?:$|[#?])/
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function ghGet(pathname) {
  const headers = { "User-Agent": "github-code-analyzer", Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return fetch(`${API}${pathname}`, { headers, signal: AbortSignal.timeout(10000) });
}

async function fetchRepoMetadata(owner, repo) {
  let res;
  try {
    res = await ghGet(`/repos/${owner}/${repo}`);
  } catch {
    throw new Error("Could not reach the GitHub API. Check your connection and try again.");
  }
  if (res.status === 404) throw new Error("Repository not found. Check the URL and that the repo is public.");
  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub API rate limit reached. Set a GITHUB_TOKEN environment variable or try again later.");
  }
  if (!res.ok) throw new Error(`GitHub API error (status ${res.status}).`);
  return res.json();
}

// Number of items for a paginated list endpoint requested with per_page=1.
async function countItems(pathname) {
  const res = await ghGet(pathname);
  if (!res.ok) return null;
  const link = res.headers.get("link");
  const last = link && link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (last) return parseInt(last[1], 10);
  const body = await res.json();
  return Array.isArray(body) ? body.length : null;
}

async function fetchRepoActivity(owner, repo) {
  const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
  const base = `/repos/${owner}/${repo}`;
  const [c30, c90, contributors] = await Promise.allSettled([
    countItems(`${base}/commits?since=${encodeURIComponent(daysAgo(30))}&per_page=1`),
    countItems(`${base}/commits?since=${encodeURIComponent(daysAgo(90))}&per_page=1`),
    countItems(`${base}/contributors?per_page=1&anon=true`),
  ]);
  const val = (r) => (r.status === "fulfilled" ? r.value : null);
  return { commits30: val(c30), commits90: val(c90), contributors: val(contributors) };
}

module.exports = { parseGithubUrl, fetchRepoMetadata, fetchRepoActivity };
