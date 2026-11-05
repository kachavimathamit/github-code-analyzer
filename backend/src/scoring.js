// Converts raw metrics into 0-100 category scores, an overall grade and
// prioritized recommendations.

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
// Linear score: `best` maps to 100, `worst` maps to 0 (works in either direction).
const lin = (value, best, worst) => clamp(((value - worst) / (best - worst)) * 100);
const round = (n) => Math.round(n);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

function gradeFromScore(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function computeScores(m) {
  const { summary, functions: fn, duplication, naming, todos, testing, deadCode, secrets, dependencies, vulnerabilities, health, robustness, architecture, originality, authorship } = m;
  const cats = [];
  const add = (key, label, weight, score, detail) => cats.push({ key, label, weight, score: score === null ? null : round(score), detail });

  add("maintainability", "Maintainability", 9,
    summary.maintainabilityIndex === null ? null : lin(summary.maintainabilityIndex, 65, 30),
    summary.maintainabilityIndex === null ? "No functions analyzed" : `Maintainability index ${summary.maintainabilityIndex}`);

  if (fn.analyzed) {
    const highShare = (fn.highComplexityCount / fn.analyzed) * 100;
    add("complexity", "Complexity", 10, 0.6 * lin(fn.avgComplexity, 3, 10) + 0.4 * lin(highShare, 0, 20),
      `Avg ${fn.avgComplexity} per function, ${fn.highComplexityCount} above ${fn.complexityThreshold}`);
  } else add("complexity", "Complexity", 10, null, "No functions analyzed");

  add("documentation", "Documentation", 5,
    summary.totalCodeLines + summary.totalCommentLines ? lin(summary.commentRatioPercent, 15, 0) : null,
    `${summary.commentRatioPercent}% comment lines`);

  add("duplication", "Duplication", 6,
    duplication.analyzedLines ? lin(duplication.duplicationPercent, 0, 17) : null,
    `${duplication.duplicationPercent}% duplicated lines`);

  if (fn.analyzed) {
    const longShare = (fn.longCount / fn.analyzed) * 100;
    const deepShare = (fn.deepCount / fn.analyzed) * 100;
    const s = (lin(fn.avgLength, 15, 60) + lin(longShare, 0, 15) + lin(fn.avgNesting, 1, 4) + lin(deepShare, 0, 10)) / 4;
    add("structure", "Structure", 7, s, `Avg function ${fn.avgLength} lines, avg nesting ${fn.avgNesting}`);
  } else add("structure", "Structure", 7, null, "No functions analyzed");

  add("testing", "Testing", 10,
    testing.sourceLines ? (testing.hasTests ? lin(testing.testToSourceRatioPercent || 0, 40, 0) : 0) : null,
    testing.hasTests ? `Test code is ${testing.testToSourceRatioPercent}% of source` : "No test files detected");

  const vulnPenalty = vulnerabilities.available ? vulnerabilities.vulnerablePackages * 6 : 0;
  add("security", "Security", 9, clamp(100 - secrets.high * 25 - secrets.medium * 8 - Math.min(secrets.low, 5) - vulnPenalty),
    `${secrets.total} secret finding(s)` + (vulnerabilities.available ? `, ${vulnerabilities.vulnerablePackages} vulnerable package(s)` : ""));

  if (dependencies.totalDirect && dependencies.checked) {
    const share = (dependencies.outdatedMajor / dependencies.checked) * 100;
    add("dependencies", "Dependencies", 3, clamp(lin(share, 0, 50) - dependencies.deprecated * 15 - dependencies.unpinned * 3),
      `${dependencies.outdatedMajor} major-outdated, ${dependencies.deprecated} deprecated of ${dependencies.checked} checked`);
  } else add("dependencies", "Dependencies", 3, null, dependencies.totalDirect ? "Registry unavailable" : "No dependency manifests");

  const hygieneParts = [lin(todos.densityPer1kLines, 1, 10), lin(naming.shortNamePercent, 0, 15)];
  if (naming.consistencyPercent !== null) hygieneParts.push(naming.consistencyPercent);
  if (deadCode.candidates >= 5) hygieneParts.push(lin(deadCode.unusedPercent, 10, 70));
  add("hygiene", "Code Hygiene", 3, summary.totalCodeLines ? avg(hygieneParts) : null,
    `${todos.densityPer1kLines} TODO markers per 1k lines`);

  // ---- Robustness -------------------------------------------------------
  if (summary.totalCodeLines) {
    const perK = (n) => (n / Math.max(summary.totalCodeLines, 1)) * 1000;
    const r = robustness;
    const critical = r.groups.filter((g) => g.type === "merge-conflict" || g.type === "sql-injection").reduce((s, g) => s + g.count, 0);
    const parts = [
      clamp(100 - critical * 25 - r.structuralCount * 10),
      lin(perK(r.groups.filter((g) => g.type === "swallowed-error").reduce((s, g) => s + g.count, 0)), 0, 4),
      lin(perK(r.groups.filter((g) => g.type === "debug-statement").reduce((s, g) => s + g.count, 0)), 0, 8),
      lin(perK(r.groups.filter((g) => g.type === "dangerous-call" || g.type === "hardcoded-path").reduce((s, g) => s + g.count, 0)), 0, 3),
      lin(perK(r.longParamCount + r.godFileCount * 2), 0, 3),
    ];
    add("robustness", "Robustness", 9, avg(parts),
      `${r.totalFindings} finding(s), ${r.high} high severity`);
  } else add("robustness", "Robustness", 9, null, "No source code analyzed");

  // ---- Architecture -----------------------------------------------------
  if (architecture && architecture.graph.modules) {
    const a = architecture;
    const parts = [
      clamp(100 - a.graph.circularCount * 20),
      a.readme.present ? a.readme.score : 0,
      a.completeness.percent,
      a.folders.flatLayout ? 45 : 100,
    ];
    add("architecture", "Architecture", 8, avg(parts),
      `${a.completeness.satisfied}/${a.completeness.applicable} project checks, ${a.graph.circularCount} circular import(s)`);
  } else add("architecture", "Architecture", 8, null, "No module graph available");

  // ---- Originality ------------------------------------------------------
  if (originality && originality.effectivePercent !== null) {
    const o = originality;
    const topMatch = o.similarSubmissions.length ? o.similarSubmissions[0].peakPercent : 0;
    const parts = [lin(o.effectivePercent, 70, 15), clamp(100 - topMatch * 2.5)];
    add("originality", "Originality", 9, avg(parts),
      `${o.effectiveCodeLines.toLocaleString()} student-written lines (${o.effectivePercent}% of non-test code)`);
  } else add("originality", "Originality", 9, null, "Not enough source code to assess");

  // ---- Authorship & effort ----------------------------------------------
  if (authorship && authorship.available) {
    const a = authorship;
    const parts = [
      lin(a.activeDayPercent, 25, 2),
      lin(a.busiestDay.share, 20, 70),
      a.messages.meaningfulPercent === null ? 50 : a.messages.meaningfulPercent,
      lin(a.commitsAnalyzed, 30, 2),
      clamp(100 - a.artifactFileCount * 2),
    ];
    if (a.contributorCount > 1) parts.push(lin(a.topContributorShare, 60, 95));
    add("authorship", "Authorship & Effort", 9, avg(parts),
      `${a.commitsAnalyzed} commits by ${a.contributorCount} author(s) over ${a.spanDays} days`);
  } else add("authorship", "Authorship & Effort", 9, null, authorship ? authorship.reason : "Git history unavailable");

  add("health", "Repository Health", 3, repoHealthScore(health), health.license.present ? `License: ${health.license.spdx || "present"}` : "No license detected");

  const scored = cats.filter((c) => c.score !== null);
  const totalWeight = scored.reduce((s, c) => s + c.weight, 0);
  const overallScore = totalWeight ? round(scored.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight) : 0;

  return { categories: cats, overallScore, grade: gradeFromScore(overallScore), recommendations: buildRecommendations(m) };
}

function repoHealthScore(health) {
  let earned = 0;
  let possible = 0;
  const award = (ok, pts) => {
    possible += pts;
    if (ok) earned += pts;
  };
  award(health.license.present, 30);
  award(health.hasCI, 15);
  award(health.hasReadme, 10);
  if (health.daysSincePush !== null) {
    possible += 25;
    if (!health.archived) earned += health.daysSincePush <= 90 ? 25 : health.daysSincePush <= 365 ? 12 : 0;
  }
  if (health.commits90 !== null) {
    possible += 20;
    earned += health.commits90 >= 10 ? 20 : health.commits90 >= 1 ? 10 : 0;
  }
  return possible ? (earned / possible) * 100 : null;
}

function buildRecommendations(m) {
  const { summary, functions: fn, duplication, todos, testing, secrets, dependencies, vulnerabilities, health, robustness, architecture, originality, authorship } = m;
  const out = [];
  const rec = (severity, category, title, detail) => out.push({ severity, category, title, detail });

  const byType = (type) => (robustness ? robustness.groups.find((g) => g.type === type) : null);
  const conflicts = byType("merge-conflict");
  if (conflicts) rec("high", "Robustness", "Resolve committed merge conflicts", `${conflicts.count} unresolved conflict marker(s) across ${conflicts.files} file(s). This code cannot compile as committed.`);
  if (robustness && robustness.structuralCount) rec("high", "Robustness", "Fix files with unbalanced delimiters", `${robustness.structuralCount} file(s) have mismatched brackets or braces, which usually means truncated or broken code.`);

  const sqli = byType("sql-injection");
  if (sqli) rec("high", "Security", "Use parameterized database queries", `${sqli.count} quer${sqli.count === 1 ? "y is" : "ies are"} built by string concatenation, which allows SQL injection.`);

  if (secrets.high > 0) rec("high", "Security", "Remove hardcoded secrets", `${secrets.high} high-severity secret(s) found across ${secrets.filesAffected} file(s). Rotate the credentials and load them from environment variables.`);
  else if (secrets.high + secrets.medium > 0) rec("medium", "Security", "Review possible credentials in source", `${secrets.high + secrets.medium} potential secret or sensitive file finding(s). Confirm none are real and move credentials out of the repository.`);

  if (originality && originality.similarSubmissions.length) {
    const top = originality.similarSubmissions[0];
    rec(top.peakPercent >= 25 ? "high" : "medium", "Originality", "Review overlap with another submission",
      `${top.similarityPercent}% of this submission's code blocks also appear in ${top.fullName}, which accounts for ${top.coveragePercent}% of that submission. Verify before grading.`);
  }
  if (originality && originality.effectivePercent !== null && originality.effectivePercent < 35 && originality.boilerplateLines > 200) {
    rec("medium", "Originality", "Most code is generated scaffolding", `Only ${originality.effectivePercent}% of non-test code (${originality.effectiveCodeLines.toLocaleString()} lines) appears to be student-written.`);
  }

  if (authorship && authorship.available) {
    if (authorship.contributorCount > 1 && authorship.topContributorShare >= 85) {
      rec("medium", "Authorship", "Contribution is heavily unbalanced", `${authorship.contributors[0].name} made ${authorship.topContributorShare}% of commits across ${authorship.contributorCount} contributors.`);
    }
    if (authorship.busiestDay.share >= 60 && authorship.commitsAnalyzed >= 5) {
      rec("medium", "Authorship", "Work was concentrated into one day", `${authorship.busiestDay.share}% of commits landed on ${authorship.busiestDay.date}, suggesting little incremental development.`);
    }
    if (authorship.messages.meaningfulPercent !== null && authorship.messages.meaningfulPercent < 50) {
      rec("low", "Authorship", "Improve commit messages", `Only ${authorship.messages.meaningfulPercent}% of commit messages are descriptive (${authorship.messages.genericCount} generic, ${authorship.messages.shortCount} too short).`);
    }
    if (authorship.artifactFileCount > 0) {
      const top = authorship.committedArtifacts[0];
      rec(authorship.artifactFileCount > 50 ? "medium" : "low", "Authorship", "Remove committed build artifacts", `${authorship.artifactFileCount} tracked file(s) should be gitignored (largest group: ${top.label}).`);
    }
  }

  if (vulnerabilities.available && vulnerabilities.vulnerablePackages > 0) {
    rec(vulnerabilities.vulnerablePackages >= 3 ? "high" : "medium", "Security", "Update vulnerable dependencies", `${vulnerabilities.vulnerablePackages} direct dependenc${vulnerabilities.vulnerablePackages === 1 ? "y has" : "ies have"} known advisories (${vulnerabilities.totalAdvisories} total).`);
  }
  if (dependencies.deprecated > 0) rec("medium", "Dependencies", "Replace deprecated packages", `${dependencies.deprecated} dependenc${dependencies.deprecated === 1 ? "y is" : "ies are"} marked deprecated or inactive.`);
  if (dependencies.outdatedMajor >= 3) rec("low", "Dependencies", "Upgrade outdated dependencies", `${dependencies.outdatedMajor} dependencies are at least one major version behind.`);

  if (testing.sourceLines) {
    if (!testing.hasTests) rec("high", "Testing", "Add automated tests", "No test files were detected. Start with tests for the most complex modules.");
    else if ((testing.testToSourceRatioPercent || 0) < 15) rec("medium", "Testing", "Increase test coverage", `Test code is only ${testing.testToSourceRatioPercent}% of source code size.`);
  }

  const swallowed = byType("swallowed-error");
  if (swallowed && swallowed.count >= 3) rec("medium", "Robustness", "Handle errors instead of swallowing them", `${swallowed.count} empty catch or bare except block(s) hide failures at runtime.`);
  const debug = byType("debug-statement");
  if (debug && debug.count >= 10) rec("low", "Robustness", "Remove debug output", `${debug.count} debug print/log statement(s) remain in non-test code.`);

  if (architecture) {
    if (architecture.graph.circularCount > 0) rec("medium", "Architecture", "Break circular imports", `${architecture.graph.circularCount} import cycle(s) detected, e.g. ${architecture.graph.circular[0]}.`);
    if (!architecture.readme.present) rec("high", "Architecture", "Add a README", "There is no README explaining what the project does or how to run it.");
    else if (architecture.readme.score < 50) {
      const missing = architecture.readme.sections.filter((s) => !s.found).map((s) => s.label.toLowerCase());
      rec("medium", "Architecture", "Expand the README", `README scores ${architecture.readme.score}/100. Missing: ${missing.slice(0, 3).join(", ")}.`);
    }
    if (architecture.folders.flatLayout) rec("low", "Architecture", "Organize files into folders", `${architecture.folders.rootFileCount} of ${architecture.graph.modules} source files sit in the repository root.`);
    if (architecture.godFiles.length) rec("low", "Architecture", "Split oversized files", `${architecture.godFiles.length} file(s) exceed ${robustness.godFileThreshold} code lines (largest: ${architecture.godFiles[0].path}).`);
  }

  if (duplication.duplicationPercent >= 10) rec("medium", "Duplication", "Reduce duplicated code", `${duplication.duplicationPercent}% of code lines are repeated across ${duplication.filesWithDuplication} file(s). Extract shared helpers.`);
  else if (duplication.duplicationPercent >= 5) rec("low", "Duplication", "Watch duplicated code", `${duplication.duplicationPercent}% of code lines are repeated.`);

  if (fn.analyzed) {
    if ((fn.longCount / fn.analyzed) * 100 > 10) rec("medium", "Structure", "Break up long functions", `${fn.longCount} functions exceed ${fn.longThreshold} lines (longest: ${fn.maxLength}).`);
    if ((fn.highComplexityCount / fn.analyzed) * 100 > 5) rec("medium", "Complexity", "Simplify complex functions", `${fn.highComplexityCount} functions have cyclomatic complexity above ${fn.complexityThreshold} (max ${fn.maxComplexity}).`);
    if (fn.deepCount > 0 && (fn.deepCount / fn.analyzed) * 100 > 3) rec("low", "Structure", "Flatten deeply nested code", `${fn.deepCount} functions nest control flow ${fn.nestingThreshold}+ levels deep.`);
    if (fn.longParamCount >= 3) rec("low", "Structure", "Reduce long parameter lists", `${fn.longParamCount} functions take more than ${fn.paramThreshold} parameters (max ${fn.maxParams}).`);
  }

  if (summary.totalCodeLines && summary.commentRatioPercent < 5) rec("low", "Documentation", "Document key modules", `Only ${summary.commentRatioPercent}% of lines are comments.`);
  if (todos.densityPer1kLines > 5) rec("low", "Hygiene", "Resolve outstanding TODO markers", `${todos.total} TODO/FIXME/HACK markers (${todos.densityPer1kLines} per 1k code lines).`);
  if (!health.license.present) rec("medium", "Repository", "Add a license", "No license was detected, which limits how others may legally use this code.");
  if (!health.hasCI) rec("low", "Repository", "Set up continuous integration", "No CI configuration was found.");
  if (health.daysSincePush !== null && health.daysSincePush > 365) rec("low", "Repository", "Repository looks inactive", `Last push was ${health.daysSincePush} days ago.`);

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 10);
}

module.exports = { computeScores, gradeFromScore };
