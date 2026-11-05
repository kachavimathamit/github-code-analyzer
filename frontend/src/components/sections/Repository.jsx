import { Badge, Card, Kpi, Section, StatLine, fmt } from "../ui";

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "n/a");

function Check({ ok, yes = "present", no = "missing" }) {
  return <Badge tone={ok ? "success" : "warning"}>{ok ? yes : no}</Badge>;
}

export default function Repository({ data }) {
  const h = data.health;
  const activityTone = h.commits90 === null ? undefined : h.commits90 >= 10 ? "success" : h.commits90 >= 1 ? "warning" : "danger";

  return (
    <Section id="sec-repository" title="Repository health" description="Activity and project hygiene from GitHub metadata and repository contents.">
      <div className="grid grid-4">
        <Kpi label="Commits (30 days)" value={fmt(h.commits30)} />
        <Kpi label="Commits (90 days)" value={fmt(h.commits90)} tone={activityTone} />
        <Kpi label="Contributors" value={fmt(h.contributors)} />
        <Kpi label="Open issues" value={fmt(h.openIssues)} hint="includes pull requests" />
        <Kpi label="Branches" value={fmt(h.branches)} />
        <Kpi label="Pull requests" value={fmt(h.pullRequests)} hint={h.mergeCommits !== null ? `${fmt(h.mergeCommits)} merge commits` : undefined} />
      </div>
      <div className="grid grid-2">
        <Card title="Activity">
          <StatLine label="Created" value={formatDate(h.createdAt)} />
          <StatLine label="Last push" value={h.daysSincePush === null ? "n/a" : `${formatDate(h.pushedAt)} (${h.daysSincePush} days ago)`} />
          <StatLine label="Archived" value={<Badge tone={h.archived ? "warning" : "success"}>{h.archived ? "yes" : "no"}</Badge>} />
          {h.commits90 === null && <p className="footnote">Commit statistics were unavailable (GitHub API rate limit). Set a GITHUB_TOKEN to raise limits.</p>}
        </Card>
        <Card title="Project hygiene">
          <StatLine label="License" value={h.license.present ? <Badge tone="success">{h.license.spdx || "present"}</Badge> : <Badge tone="warning">missing</Badge>} />
          <StatLine label="README" value={<Check ok={h.hasReadme} />} />
          <StatLine label="CI configuration" value={<Check ok={h.hasCI} />} />
          <StatLine label=".gitignore" value={<Check ok={h.hasGitignore} />} />
          <StatLine label="Automated tests" value={<Check ok={h.hasTests} yes="detected" no="none" />} />
        </Card>
      </div>
    </Section>
  );
}
