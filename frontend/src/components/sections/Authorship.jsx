import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, DataTable, Kpi, ProgressBar, Section, StatLine, chartAxis, chartColors, chartTooltip, fmt } from "../ui";

const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "-");

export default function Authorship({ data }) {
  const a = data.authorship;

  if (!a || !a.available) {
    return (
      <Section id="sec-authorship" title="Authorship & effort" description="Who wrote the code, and how the work was spread over time.">
        <Card>
          <div className="table-empty">{(a && a.reason) || "Git history was not available for this repository."}</div>
        </Card>
      </Section>
    );
  }

  const solo = a.contributorCount === 1;
  const balanceTone = solo ? undefined : a.topContributorShare >= 85 ? "danger" : a.topContributorShare >= 70 ? "warning" : "success";
  const crammed = a.busiestDay.share >= 60 && a.commitsAnalyzed >= 5;
  const pieData = a.contributors.slice(0, 6).map((c) => ({ name: c.name, value: c.commits }));
  const others = a.contributors.slice(6).reduce((s, c) => s + c.commits, 0);
  if (others > 0) pieData.push({ name: "Others", value: others });

  return (
    <Section id="sec-authorship" title="Authorship & effort" description="Who wrote the code, how balanced the team contribution was, and whether work was spread over time or crammed.">
      {a.shallow && (
        <div className="notice notice-warning">
          This repository was too large for a full clone, so only the most recent commits were analyzed.
        </div>
      )}

      <div className="grid grid-4">
        <Kpi label="Commits analyzed" value={fmt(a.commitsAnalyzed)} hint={a.totalCommits > a.commitsAnalyzed ? `${fmt(a.totalCommits)} total` : undefined} />
        <Kpi label="Contributors" value={fmt(a.contributorCount)} hint={solo ? "solo project" : `top author ${a.topContributorShare}%`} tone={balanceTone} />
        <Kpi label="Development span" value={`${fmt(a.spanDays)} days`} hint={`${shortDate(a.firstCommit)} to ${shortDate(a.lastCommit)}`} />
        <Kpi label="Active days" value={fmt(a.activeDays)} hint={`${a.activeDayPercent}% of the span`} tone={a.activeDayPercent < 5 ? "warning" : undefined} />
      </div>

      <Card title="Commit activity over time" subtitle={`Commits per ${a.timeline.granularity}`}>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={a.timeline.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf3" vertical={false} />
              <XAxis dataKey="date" {...chartAxis} tickLine={false} minTickGap={40} />
              <YAxis {...chartAxis} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...chartTooltip} />
              <Area type="monotone" dataKey="commits" stroke="#2457d6" fill="#2457d6" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-3" style={{ marginTop: 12 }}>
          <StatLine label="Busiest single day" value={`${a.busiestDay.commits} commits (${a.busiestDay.share}%)`} />
          <StatLine label="Commits in final 48 hours" value={`${a.finalBurstPercent}%`} />
          <StatLine label="Avg commits per active day" value={a.avgCommitsPerActiveDay} />
        </div>
        {crammed && (
          <p className="footnote">
            <Badge tone="warning">review</Badge> {a.busiestDay.share}% of all commits landed on {a.busiestDay.date}, which suggests the work was not developed incrementally.
          </p>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="Contribution by author" subtitle={solo ? "Single-author project" : `Balance score (Gini) ${a.contributionGini}`}>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Commit message quality" subtitle={`${fmt(a.messages.analyzed)} messages scored`}>
          <div className="big-number">{a.messages.meaningfulPercent === null ? "n/a" : `${a.messages.meaningfulPercent}%`}</div>
          <div className="card-sub" style={{ marginBottom: 10 }}>descriptive messages</div>
          <ProgressBar value={a.messages.meaningfulPercent || 0} />
          <div style={{ marginTop: 10 }}>
            <StatLine label="Generic (update, fix, asdf)" value={fmt(a.messages.genericCount)} />
            <StatLine label="Too short" value={fmt(a.messages.shortCount)} />
            <StatLine label="Conventional commits format" value={fmt(a.messages.conventionalCount)} />
            <StatLine label="Average subject length" value={`${a.messages.avgSubjectLength} chars`} />
          </div>
          {a.messages.poorExamples.length > 0 && (
            <>
              <div className="kpi-label" style={{ marginTop: 12, marginBottom: 6 }}>Weakest messages</div>
              <div className="chips">
                {a.messages.poorExamples.slice(0, 6).map((m, i) => (
                  <span key={i} className="chip mono">{m || "(empty)"}</span>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title="Per-author contribution" subtitle="Line counts exclude lock files and generated or vendored folders.">
        <DataTable
          columns={[
            { key: "name", label: "Author" },
            { key: "commits", label: "Commits", num: true },
            { key: "commitShare", label: "Share", num: true, render: (r) => `${r.commitShare}%` },
            { key: "insertions", label: "Lines +", num: true, render: (r) => fmt(r.insertions) },
            { key: "deletions", label: "Lines -", num: true, render: (r) => fmt(r.deletions) },
            { key: "filesTouched", label: "Files", num: true },
            { key: "firstCommit", label: "First", render: (r) => shortDate(r.firstCommit) },
            { key: "lastCommit", label: "Last", render: (r) => shortDate(r.lastCommit) },
          ]}
          rows={a.contributors}
        />
      </Card>

      <Card
        title="Repository hygiene"
        subtitle="Files that are tracked in git but should normally be ignored."
        action={<Badge tone={a.artifactFileCount ? (a.artifactFileCount > 50 ? "danger" : "warning") : "success"}>{a.artifactFileCount} tracked artifact{a.artifactFileCount === 1 ? "" : "s"}</Badge>}
      >
        <DataTable
          columns={[
            { key: "label", label: "Pattern", render: (r) => <span className="mono">{r.label}</span> },
            { key: "kind", label: "Type" },
            { key: "count", label: "Files", num: true, render: (r) => fmt(r.count) },
          ]}
          rows={a.committedArtifacts}
          empty="No build output, dependency folders or editor files are committed."
        />
        <p className="footnote">{fmt(a.trackedFiles)} files tracked in total.</p>
      </Card>
    </Section>
  );
}
