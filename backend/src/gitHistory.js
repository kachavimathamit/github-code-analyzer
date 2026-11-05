// Authorship and effort metrics derived from the cloned repository's git log.

const { isGeneratedPath, classifyArtifact, isBotAuthor } = require("./paths");

const REC = "\x01";
const FLD = "\x02";
const MAX_COMMITS = 5000;
const DAY_MS = 86400000;

const GENERIC_MESSAGE =
  /^(?:update[sd]?|fix(?:e[sd])?|change[sd]?|commit|commits|test(?:ing)?|wip|temp|tmp|asdf|stuff|misc|minor|edit(?:s|ed)?|final|done|new|add(?:ed)?|modif(?:y|ied)|upload(?:ed)?|init|initial commit|first commit|last commit|no message|code|work|progress|changes made|updated files?|new file|main|master|\W+)$/i;

const CONVENTIONAL = /^(?:feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(?:\([^)]*\))?!?:\s*\S/i;
const MERGE_SUBJECT = /^(?:Merge|Revert)\b/;

async function raw(git, args) {
  try {
    return await git.raw(args);
  } catch {
    return null;
  }
}

function normalizeAuthor(name, email) {
  const mail = String(email || "").trim().toLowerCase();
  const noreply = mail.match(/^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$/);
  const key = noreply ? `gh:${noreply[1].toLowerCase()}` : mail || `name:${String(name || "unknown").trim().toLowerCase()}`;
  return { key, name: String(name || "Unknown").trim() || "Unknown", email: mail };
}

// numstat renames arrive as "old => new" or "pre/{a => b}/post"
function cleanPath(p) {
  if (!p.includes("=>")) return p;
  const braced = p.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
  if (braced) return `${braced[1]}${braced[3]}${braced[4]}`.replace(/\/\//g, "/");
  const plain = p.split(" => ");
  return plain[plain.length - 1].trim();
}

function scoreMessages(subjects) {
  let generic = 0;
  let tooShort = 0;
  let conventional = 0;
  let good = 0;
  let lengthSum = 0;
  const poor = [];

  for (const subject of subjects) {
    const s = subject.trim();
    lengthSum += s.length;
    const isConventional = CONVENTIONAL.test(s);
    const isGeneric = GENERIC_MESSAGE.test(s);
    const isShort = s.length < 10 || (!s.includes(" ") && s.length < 15);
    if (isConventional) conventional++;
    if (isGeneric) generic++;
    if (isShort) tooShort++;
    if (isConventional || (!isGeneric && !isShort && /[A-Za-z]{3}/.test(s))) good++;
    else if (poor.length < 12) poor.push(s.slice(0, 80));
  }

  const total = subjects.length;
  return {
    analyzed: total,
    meaningfulPercent: total ? Math.round((good / total) * 1000) / 10 : null,
    genericCount: generic,
    shortCount: tooShort,
    conventionalCount: conventional,
    avgSubjectLength: total ? Math.round((lengthSum / total) * 10) / 10 : 0,
    poorExamples: poor,
  };
}

// Granularity adapts to the span so the whole history always fits on the chart:
// days for a typical coursework project, months for a decade-old repository.
function buildTimeline(dates) {
  if (!dates.length) return { granularity: "day", points: [] };
  const first = dates[0];
  const last = dates[dates.length - 1];
  const spanDays = Math.max(1, Math.round((last - first) / DAY_MS));

  if (spanDays > 900) {
    const counts = new Map();
    for (const d of dates) {
      const dt = new Date(d);
      counts.set(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`, (counts.get(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`) || 0) + 1);
    }
    const points = [];
    const cursor = new Date(Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth(), 1));
    const end = new Date(Date.UTC(new Date(last).getUTCFullYear(), new Date(last).getUTCMonth(), 1));
    while (cursor <= end) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      points.push({ date: key, commits: counts.get(key) || 0 });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { granularity: "month", points };
  }

  const granularity = spanDays <= 120 ? "day" : "week";
  const bucketMs = granularity === "day" ? DAY_MS : 7 * DAY_MS;
  const counts = new Map();
  for (const d of dates) {
    const bucket = Math.floor(d / bucketMs) * bucketMs;
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const points = [];
  for (let t = Math.floor(first / bucketMs) * bucketMs; t <= last; t += bucketMs) {
    points.push({ date: new Date(t).toISOString().slice(0, 10), commits: counts.get(t) || 0 });
  }
  return { granularity, points };
}

function giniOf(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (v.length < 2) return 0;
  const total = v.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let weighted = 0;
  v.forEach((x, i) => (weighted += (i + 1) * x));
  return Math.max(0, Math.min(1, (2 * weighted) / (v.length * total) - (v.length + 1) / v.length));
}

async function analyzeGitHistory(git, { shallow = false } = {}) {
  const logText = await raw(git, [
    "log",
    "--no-merges",
    "--numstat",
    `--max-count=${MAX_COMMITS}`,
    `--format=${REC}%H${FLD}%an${FLD}%ae${FLD}%aI${FLD}%s`,
  ]);

  if (logText === null) {
    return { available: false, reason: "Git history could not be read." };
  }

  const authors = new Map();
  const fileTouches = new Map(); // path -> commit count
  const subjects = [];
  const dates = [];
  let commitCount = 0;
  let firstCommitHash = null;
  let current = null;

  for (const line of logText.split("\n")) {
    if (line.startsWith(REC)) {
      const [hash, name, email, iso, subject] = line.slice(1).split(FLD);
      const when = Date.parse(iso);
      current = { hash, ...normalizeAuthor(name, email), when, bot: isBotAuthor(name, email) };
      firstCommitHash = hash;
      if (current.bot) continue;
      commitCount++;
      subjects.push(subject || "");
      if (!Number.isNaN(when)) dates.push(when);
      let rec = authors.get(current.key);
      if (!rec) {
        rec = { key: current.key, name: current.name, email: current.email, commits: 0, insertions: 0, deletions: 0, files: new Set(), first: when, last: when };
        authors.set(current.key, rec);
      }
      rec.commits++;
      if (!Number.isNaN(when)) {
        rec.first = Math.min(rec.first || when, when);
        rec.last = Math.max(rec.last || when, when);
      }
      continue;
    }
    if (!current || current.bot || !line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const path = cleanPath(parts[2].trim());
    if (isGeneratedPath(path)) continue;
    const added = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
    const removed = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
    const rec = authors.get(current.key);
    if (rec) {
      rec.insertions += added;
      rec.deletions += removed;
      rec.files.add(path);
    }
    fileTouches.set(path, (fileTouches.get(path) || 0) + 1);
  }

  if (!commitCount) {
    return { available: false, reason: "No non-bot commits found in the cloned history." };
  }

  dates.sort((a, b) => a - b);

  // Merge author records that share a display name (same person, two emails).
  const byName = new Map();
  for (const rec of authors.values()) {
    const nameKey = rec.name.toLowerCase();
    const existing = byName.get(nameKey);
    if (!existing) {
      byName.set(nameKey, rec);
      continue;
    }
    existing.commits += rec.commits;
    existing.insertions += rec.insertions;
    existing.deletions += rec.deletions;
    rec.files.forEach((f) => existing.files.add(f));
    existing.first = Math.min(existing.first, rec.first);
    existing.last = Math.max(existing.last, rec.last);
  }

  const contributors = [...byName.values()]
    .map((r) => ({
      name: r.name,
      email: r.email,
      commits: r.commits,
      insertions: r.insertions,
      deletions: r.deletions,
      filesTouched: r.files.size,
      commitShare: Math.round((r.commits / commitCount) * 1000) / 10,
      firstCommit: r.first ? new Date(r.first).toISOString() : null,
      lastCommit: r.last ? new Date(r.last).toISOString() : null,
    }))
    .sort((a, b) => b.commits - a.commits);

  const totalInsertions = contributors.reduce((s, c) => s + c.insertions, 0);
  for (const c of contributors) {
    c.lineShare = totalInsertions ? Math.round((c.insertions / totalInsertions) * 1000) / 10 : 0;
  }

  // Effort distribution over time
  const dayKeys = new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)));
  const perDay = new Map();
  for (const d of dates) {
    const k = new Date(d).toISOString().slice(0, 10);
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }
  const busiestDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
  const lastDayKey = new Date(dates[dates.length - 1]).toISOString().slice(0, 10);
  const spanDays = Math.max(1, Math.round((dates[dates.length - 1] - dates[0]) / DAY_MS) + 1);
  const finalPushWindow = dates.filter((d) => d > dates[dates.length - 1] - 2 * DAY_MS).length;

  const mergeCountText = await raw(git, ["rev-list", "--count", "--merges", "HEAD"]);
  const totalCountText = await raw(git, ["rev-list", "--count", "HEAD"]);
  const trackedText = await raw(git, ["ls-files"]);
  const branchText = await raw(git, ["ls-remote", "--heads", "origin"]);
  const branches = branchText ? branchText.split("\n").filter((l) => l.trim()).length : null;

  const now = Date.now();
  const commitsSince = (days) => dates.filter((d) => d >= now - days * DAY_MS).length;

  const tracked = trackedText ? trackedText.split("\n").map((s) => s.trim()).filter(Boolean) : [];
  const artifactGroups = new Map();
  for (const file of tracked) {
    const hit = classifyArtifact(file);
    if (!hit) continue;
    const g = artifactGroups.get(hit.label) || { label: hit.label, kind: hit.kind, count: 0, example: file };
    g.count++;
    artifactGroups.set(hit.label, g);
  }
  const committedArtifacts = [...artifactGroups.values()].sort((a, b) => b.count - a.count);
  const artifactFileCount = committedArtifacts.reduce((s, g) => s + g.count, 0);

  // Files that were created in the oldest commit of the log and never touched again
  const singleTouchFiles = [...fileTouches.entries()].filter(([, n]) => n === 1).map(([p]) => p);

  return {
    available: true,
    shallow,
    commitsAnalyzed: commitCount,
    totalCommits: totalCountText ? parseInt(totalCountText.trim(), 10) : commitCount,
    mergeCommits: mergeCountText ? parseInt(mergeCountText.trim(), 10) : 0,
    branches,
    commits30: commitsSince(30),
    commits90: commitsSince(90),
    contributors: contributors.slice(0, 25),
    contributorCount: contributors.length,
    topContributorShare: contributors.length ? contributors[0].commitShare : 0,
    contributionGini: Math.round(giniOf(contributors.map((c) => c.commits)) * 100) / 100,
    totalInsertions,
    totalDeletions: contributors.reduce((s, c) => s + c.deletions, 0),
    firstCommit: new Date(dates[0]).toISOString(),
    lastCommit: new Date(dates[dates.length - 1]).toISOString(),
    spanDays,
    activeDays: dayKeys.size,
    activeDayPercent: Math.round((dayKeys.size / spanDays) * 1000) / 10,
    avgCommitsPerActiveDay: Math.round((commitCount / dayKeys.size) * 10) / 10,
    busiestDay: { date: busiestDay[0], commits: busiestDay[1], share: Math.round((busiestDay[1] / commitCount) * 1000) / 10 },
    lastDayCommits: perDay.get(lastDayKey) || 0,
    finalBurstPercent: Math.round((finalPushWindow / commitCount) * 1000) / 10,
    timeline: buildTimeline(dates),
    messages: scoreMessages(subjects),
    trackedFiles: tracked.length,
    committedArtifacts,
    artifactFileCount,
    singleTouchFiles,
    firstCommitHash,
  };
}

module.exports = { analyzeGitHistory, MERGE_SUBJECT };
