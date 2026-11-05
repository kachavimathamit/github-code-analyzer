// Dependency health (outdated / deprecated / unpinned) and known-vulnerability
// lookup via the public npm registry, PyPI and OSV.dev APIs.

const fs = require("fs");
const path = require("path");

const MAX_CHECKED = 80;
const MAX_VULN_QUERIES = 150;
const CONCURRENCY = 10;
const TIMEOUT_MS = 6000;

const TEST_FRAMEWORKS = ["jest", "mocha", "vitest", "jasmine", "ava", "tap", "cypress", "playwright", "supertest", "karma", "pytest", "nose", "unittest2"];
const SKIP_DIRS = /(?:^|\/)(?:tests?|fixtures?|examples?|docs?|samples?|e2e|__tests__)\//i;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function majorOf(version) {
  const m = String(version || "").match(/(\d+)\.(\d+)?/);
  return m ? parseInt(m[1], 10) : null;
}

function cleanVersion(spec) {
  const m = String(spec || "").match(/(\d+\.\d+\.\d+(?:[-+][\w.]+)?)/);
  if (m) return m[1];
  const short = String(spec || "").match(/(\d+\.\d+)/);
  return short ? short[1] + ".0" : null;
}

function isRegistrySpec(spec) {
  return !/^(?:git|github:|file:|link:|workspace:|http|npm:|\.|\/|~\/)/i.test(spec) && !/\//.test(spec.replace(/^[\^~>=<\s]+/, ""));
}

async function getJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "github-code-analyzer", ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function mapPool(items, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i]);
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
  return results;
}

function parseNpm(rootDir, manifestRel, allManifests) {
  const pkg = readJson(path.join(rootDir, manifestRel));
  if (!pkg) return null;
  const dir = path.posix.dirname(manifestRel);
  const lockRel = allManifests.find((p) => p === (dir === "." ? "package-lock.json" : `${dir}/package-lock.json`));
  const locked = {};
  if (lockRel) {
    const lock = readJson(path.join(rootDir, lockRel));
    if (lock && lock.packages) {
      for (const [key, val] of Object.entries(lock.packages)) {
        if (key.startsWith("node_modules/") && val && val.version) locked[key.slice("node_modules/".length)] = val.version;
      }
    } else if (lock && lock.dependencies) {
      for (const [name, val] of Object.entries(lock.dependencies)) if (val && val.version) locked[name] = val.version;
    }
  }
  const out = [];
  for (const [name, spec] of Object.entries(pkg.dependencies || {})) out.push({ name, spec: String(spec), dev: false, locked: locked[name] || null });
  for (const [name, spec] of Object.entries(pkg.devDependencies || {})) out.push({ name, spec: String(spec), dev: true, locked: locked[name] || null });
  return { path: manifestRel, ecosystem: "npm", deps: out, hasLock: Boolean(lockRel) };
}

function parseRequirements(rootDir, manifestRel) {
  let text;
  try {
    text = fs.readFileSync(path.join(rootDir, manifestRel), "utf8");
  } catch {
    return null;
  }
  const deps = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("-") || /^(?:git\+|https?:|\.|\/)/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*(?:(==|>=|<=|~=|!=|>|<)\s*([\w.*+-]+))?/);
    if (!m) continue;
    deps.push({ name: m[1], spec: m[2] ? m[2] + m[3] : "", op: m[2] || null, pinned: m[2] === "==" ? m[3] : null, dev: false, locked: m[2] === "==" ? m[3] : null });
  }
  return { path: manifestRel, ecosystem: "PyPI", deps, hasLock: false };
}

async function checkNpm(dep) {
  const data = await getJson(`https://registry.npmjs.org/${encodeURIComponent(dep.name)}/latest`);
  return { latest: data.version || null, deprecated: data.deprecated ? String(data.deprecated).slice(0, 160) : null };
}

async function checkPyPI(dep) {
  const data = await getJson(`https://pypi.org/pypi/${encodeURIComponent(dep.name)}/json`);
  const classifiers = (data.info && data.info.classifiers) || [];
  const inactive = classifiers.some((c) => c.includes("Development Status :: 7 - Inactive"));
  return { latest: data.info ? data.info.version : null, deprecated: inactive ? "Marked inactive on PyPI" : null };
}

async function analyzeDependencies(rootDir, manifestPaths) {
  const usable = manifestPaths.filter((p) => !SKIP_DIRS.test(p));
  const parsed = [];
  for (const rel of usable) {
    if (path.posix.basename(rel) === "package.json") {
      const m = parseNpm(rootDir, rel, manifestPaths);
      if (m && m.deps.length) parsed.push(m);
    } else if (path.posix.basename(rel) === "requirements.txt") {
      const m = parseRequirements(rootDir, rel);
      if (m && m.deps.length) parsed.push(m);
    }
    if (parsed.length >= 4) break;
  }

  const manifests = parsed.map((m) => ({
    path: m.path,
    ecosystem: m.ecosystem,
    prod: m.deps.filter((d) => !d.dev).length,
    dev: m.deps.filter((d) => d.dev).length,
    lockfile: m.hasLock,
  }));

  const allDeps = [];
  const seen = new Set();
  for (const m of parsed) {
    for (const d of m.deps) {
      const key = `${m.ecosystem}:${d.name}:${d.dev}`;
      if (seen.has(key)) continue;
      seen.add(key);
      allDeps.push({ ...d, ecosystem: m.ecosystem, approximate: m.ecosystem === "npm" && !d.locked });
    }
  }

  const dependencies = {
    available: true,
    manifests,
    totalDirect: allDeps.length,
    prodCount: allDeps.filter((d) => !d.dev).length,
    devCount: allDeps.filter((d) => d.dev).length,
    checked: 0,
    outdatedMajor: 0,
    deprecated: 0,
    unpinned: 0,
    outdatedList: [],
    deprecatedList: [],
    testFrameworks: [],
  };
  const vulnerabilities = { available: false, checked: 0, vulnerablePackages: 0, totalAdvisories: 0, approximate: false, list: [] };

  dependencies.testFrameworks = [...new Set(allDeps.map((d) => d.name).filter((n) => TEST_FRAMEWORKS.includes(n)))];
  dependencies.unpinned = allDeps.filter((d) => d.ecosystem === "npm" && (d.spec === "*" || d.spec === "latest" || d.spec === "")).length;

  if (!allDeps.length) return { dependencies, vulnerabilities };

  // Registry checks (prod dependencies first)
  const toCheck = [...allDeps.filter((d) => !d.dev), ...allDeps.filter((d) => d.dev)]
    .filter((d) => d.ecosystem !== "npm" || isRegistrySpec(d.spec))
    .slice(0, MAX_CHECKED);
  const registry = await mapPool(toCheck, (d) => (d.ecosystem === "npm" ? checkNpm(d) : checkPyPI(d)));

  toCheck.forEach((d, i) => {
    const info = registry[i];
    if (!info) return;
    dependencies.checked++;
    const current = d.locked || cleanVersion(d.spec);
    if (info.deprecated) {
      dependencies.deprecated++;
      dependencies.deprecatedList.push({ name: d.name, ecosystem: d.ecosystem, dev: d.dev, message: info.deprecated });
    }
    const cm = majorOf(current);
    const lm = majorOf(info.latest);
    if (cm !== null && lm !== null && lm > cm) {
      dependencies.outdatedMajor++;
      dependencies.outdatedList.push({ name: d.name, ecosystem: d.ecosystem, dev: d.dev, current, latest: info.latest, majorsBehind: lm - cm });
    }
  });
  dependencies.outdatedList.sort((a, b) => b.majorsBehind - a.majorsBehind);
  dependencies.outdatedList = dependencies.outdatedList.slice(0, 15);
  dependencies.deprecatedList = dependencies.deprecatedList.slice(0, 10);

  // Vulnerabilities via OSV.dev
  const queries = allDeps
    .map((d) => ({ d, version: d.locked || (d.ecosystem === "npm" ? cleanVersion(d.spec) : null) }))
    .filter((q) => q.version && (q.d.ecosystem !== "npm" || isRegistrySpec(q.d.spec)))
    .slice(0, MAX_VULN_QUERIES);

  if (queries.length) {
    try {
      const body = JSON.stringify({ queries: queries.map((q) => ({ package: { name: q.d.name, ecosystem: q.d.ecosystem }, version: q.version })) });
      const data = await getJson("https://api.osv.dev/v1/querybatch", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      vulnerabilities.available = true;
      vulnerabilities.checked = queries.length;
      vulnerabilities.approximate = queries.some((q) => q.d.approximate);
      (data.results || []).forEach((res, i) => {
        const vulns = (res && res.vulns) || [];
        if (!vulns.length) return;
        vulnerabilities.vulnerablePackages++;
        vulnerabilities.totalAdvisories += vulns.length;
        vulnerabilities.list.push({
          name: queries[i].d.name,
          version: queries[i].version,
          ecosystem: queries[i].d.ecosystem,
          dev: queries[i].d.dev,
          count: vulns.length,
          ids: vulns.slice(0, 4).map((v) => v.id),
        });
      });
      vulnerabilities.list.sort((a, b) => b.count - a.count);
      vulnerabilities.list = vulnerabilities.list.slice(0, 20);
    } catch {
      vulnerabilities.available = false;
    }
  }

  return { dependencies, vulnerabilities };
}

module.exports = { analyzeDependencies };
