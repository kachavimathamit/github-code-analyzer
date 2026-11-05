// Converts raw metrics into 0-100 category scores, an overall grade and
// prioritized recommendations.

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
// Linear score: `best` maps to 100, `worst` maps to 0 (works in either direction).
const lin = (value, best, worst) => clamp(((value - worst) / (best - worst)) * 100);
const round = (n) => Math.round(n);

function gradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function computeScores(m) {
  const { summary, functions: fn, duplication, naming, todos, testing, deadCode, secrets, dependencies, vulnerabilities, health } = m;
  const cats = [];
  const add = (key, label, weight, score, detail) => cats.push({ key, label, weight, score: score === null ? null : round(score), detail });

  add("maintainability", "Maintainability", 15,
    summary.maintainabilityIndex === null ? null : lin(summary.maintainabilityIndex, 65, 30),
    summary.maintainabilityIndex === null ? "No functions analyzed" : `Maintainability index ${summary.maintainabilityIndex}`);

  if (fn.analyzed) {
    const highShare = (fn.highComplexityCount / fn.analyzed) * 100;
    add("complexity", "Complexity", 15, 0.6 * lin(fn.avgComplexity, 3, 10) + 0.4 * lin(highShare, 0, 20),
      `Avg ${fn.avgComplexity} per function, ${fn.highComplexityCount} above ${fn.complexityThreshold}`);
  } else add("complexity", "Complexity", 15, null, "No functions analyzed");

  add("documentation", "Documentation", 8,
    summary.totalCodeLines + summary.totalCommentLines ? lin(summary.commentRatioPercent, 15, 0) : null,
    `${summary.commentRatioPercent}% comment lines`);

  add("duplication", "Duplication", 10,
    duplication.analyzedLines ? lin(duplication.duplicationPercent, 0, 17) : null,
    `${duplication.duplicationPercent}% duplicated lines`);

  if (fn.analyzed) {
    const longShare = (fn.longCount / fn.analyzed) * 100;
    const deepShare = (fn.deepCount / fn.analyzed) * 100;
    const s = (lin(fn.avgLength, 15, 60) + lin(longShare, 0, 15) + lin(fn.avgNesting, 1, 4) + lin(deepShare, 0, 10)) / 4;
    add("structure", "Structure", 12, s, `Avg function ${fn.avgLength} lines, avg nesting ${fn.avgNesting}`);
  } else add("structure", "Structure", 12, null, "No functions analyzed");

  add("testing", "Testing", 12,
    testing.sourceLines ? (testing.hasTests ? lin(testing.testToSourceRatioPercent || 0, 40, 0) : 0) : null,
    testing.hasTests ? `Test code is ${testing.testToSourceRatioPercent}% of source` : "No test files detected");

  const vulnPenalty = vulnerabilities.available ? vulnerabilities.vulnerablePackages * 6 : 0;
  add("security", "Security", 12, clamp(100 - secrets.high * 25 - secrets.medium * 8 - Math.min(secrets.low, 5) - vulnPenalty),
    `${secrets.total} secret finding(s)` + (vulnerabilities.available ? `, ${vulnerabilities.vulnerablePackages} vulnerable package(s)` : ""));

  if (dependencies.totalDirect && dependencies.checked) {
    const share = (dependencies.outdatedMajor / dependencies.checked) * 100;
    add("dependencies", "Dependencies", 6, clamp(lin(share, 0, 50) - dependencies.deprecated * 15 - dependencies.unpinned * 3),
      `${dependencies.outdatedMajor} major-outdated, ${dependencies.deprecated} deprecated of ${dependencies.checked} checked`);
  } else add("dependencies", "Dependencies", 6, null, dependencies.totalDirect ? "Registry unavailable" : "No dependency manifests");

  const hygieneParts = [lin(todos.densityPer1kLines, 1, 10), lin(naming.shortNamePercent, 0, 15)];
  if (naming.consistencyPercent !== null) hygieneParts.push(naming.consistencyPercent);
  if (deadCode.candidates >= 5) hygieneParts.push(lin(deadCode.unusedPercent, 10, 70));
  add("hygiene", "Code Hygiene", 5, summary.totalCodeLines ? hygieneParts.reduce((a, b) => a + b, 0) / hygieneParts.length : null,
    `${todos.densityPer1kLines} TODO markers per 1k lines`);

  let earned = 0;
  let possible = 0;
  const award = (ok, pts) => { possible += pts; if (ok) earned += pts; };
  award(health.license.present, 30);
  award(health.hasCI, 15);
  award(health.hasReadme, 10);
  if (health.daysSincePush !== null) {
    possible += 25;
    if (!health.archived) earned += health.daysSincePush <= 90 ? 25 : health.daysSincePush <= 365 ? 12 : 0;
  }
  if (health.commits90 !== null) { possible += 20; earned += health.commits90 >= 10 ? 20 : health.commits90 >= 1 ? 10 : 0; }
  add("health", "Repository Health", 5, possible ? (earned / possible) * 100 : null,
    health.license.present ? `License: ${health.license.spdx || "present"}` : "No license detected");

  const scored = cats.filter((c) => c.score !== null);
  const totalWeight = scored.reduce((s, c) => s + c.weight, 0);
  const overallScore = totalWeight ? round(scored.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) : 0;

  return { categories: cats, overallScore, grade: gradeFromScore(overallScore), recommendations: buildRecommendations(m) };
}

function buildRecommendations(m) {
  const { summary, functions: fn, duplication, todos, testing, secrets, dependencies, vulnerabilities, health } = m;
  const out = [];
  const rec = (severity, category, title, detail) => out.push({ severity, category, title, detail });

  if (secrets.high > 0) rec("high", "Security", "Remove hardcoded secrets", `${secrets.high} high-severity secret(s) found across ${secrets.filesAffected} file(s). Rotate the credentials and load them from environment variables.`);
  else if (secrets.high + secrets.medium > 0) rec("medium", "Security", "Review possible credentials in source", `${secrets.high + secrets.medium} potential secret or sensitive file finding(s). Confirm none are real and move credentials out of the repository.`);
  if (vulnerabilities.available && vulnerabilities.vulnerablePackages > 0) {
    rec(vulnerabilities.vulnerablePackages >= 3 ? "high" : "medium", "Security", "Update vulnerable dependencies", `${vulnerabilities.vulnerablePackages} direct dependenc${vulnerabilities.vulnerablePackages === 1 ? "y has" : "ies have"} known advisories (${vulnerabilities.totalAdvisories} total).`);
  }
  if (dependencies.deprecated > 0) rec("medium", "Dependencies", "Replace deprecated packages", `${dependencies.deprecated} dependenc${dependencies.deprecated === 1 ? "y is" : "ies are"} marked deprecated or inactive.`);
  if (dependencies.outdatedMajor >= 3) rec("low", "Dependencies", "Upgrade outdated dependencies", `${dependencies.outdatedMajor} dependencies are at least one major version behind.`);
  if (testing.sourceLines) {
    if (!testing.hasTests) rec("high", "Testing", "Add automated tests", "No test files were detected. Start with tests for the most complex modules.");
    else if ((testing.testToSourceRatioPercent || 0) < 15) rec("medium", "Testing", "Increase test coverage", `Test code is only ${testing.testToSourceRatioPercent}% of source code size.`);
  }
  if (duplication.duplicationPercent >= 10) rec("medium", "Duplication", "Reduce duplicated code", `${duplication.duplicationPercent}% of code lines are repeated across ${duplication.filesWithDuplication} file(s). Extract shared helpers.`);
  else if (duplication.duplicationPercent >= 5) rec("low", "Duplication", "Watch duplicated code", `${duplication.duplicationPercent}% of code lines are repeated.`);
  if (fn.analyzed) {
    if ((fn.longCount / fn.analyzed) * 100 > 10) rec("medium", "Structure", "Break up long functions", `${fn.longCount} functions exceed ${fn.longThreshold} lines (longest: ${fn.maxLength}).`);
    if ((fn.highComplexityCount / fn.analyzed) * 100 > 5) rec("medium", "Complexity", "Simplify complex functions", `${fn.highComplexityCount} functions have cyclomatic complexity above ${fn.complexityThreshold} (max ${fn.maxComplexity}).`);
    if (fn.deepCount > 0 && (fn.deepCount / fn.analyzed) * 100 > 3) rec("low", "Structure", "Flatten deeply nested code", `${fn.deepCount} functions nest control flow ${fn.nestingThreshold}+ levels deep.`);
  }
  if (summary.totalCodeLines && summary.commentRatioPercent < 5) rec("low", "Documentation", "Document key modules", `Only ${summary.commentRatioPercent}% of lines are comments.`);
  if (todos.densityPer1kLines > 5) rec("low", "Hygiene", "Resolve outstanding TODO markers", `${todos.total} TODO/FIXME/HACK markers (${todos.densityPer1kLines} per 1k code lines).`);
  if (!health.license.present) rec("medium", "Repository", "Add a license", "No license was detected, which limits how others may legally use this code.");
  if (!health.hasCI) rec("low", "Repository", "Set up continuous integration", "No CI configuration was found.");
  if (health.daysSincePush !== null && health.daysSincePush > 365) rec("low", "Repository", "Repository looks inactive", `Last push was ${health.daysSincePush} days ago.`);

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

module.exports = { computeScores, gradeFromScore };
