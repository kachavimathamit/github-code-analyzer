import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, DataTable, Kpi, ProgressBar, Section, StatLine, chartAxis, chartTooltip, fmt } from "../ui";

export default function Originality({ data }) {
  const o = data.originality;
  if (!o) return null;

  const topMatch = o.similarSubmissions.length ? o.similarSubmissions[0] : null;
  const effTone = o.effectivePercent === null ? undefined : o.effectivePercent >= 60 ? "success" : o.effectivePercent >= 35 ? "warning" : "danger";

  const composition = [
    { name: "Student-written", lines: o.effectiveCodeLines },
    { name: "Scaffolding", lines: o.boilerplateLines },
    { name: "Generated/vendored", lines: o.generatedLines },
    { name: "Tests", lines: o.testLines },
  ].filter((d) => d.lines > 0);

  return (
    <Section
      id="sec-originality"
      title="Originality"
      description="How much of the submission is the student's own work rather than framework scaffolding, and whether it overlaps with other analyzed repositories."
    >
      <div className="grid grid-4">
        <Kpi label="Student-written lines" value={fmt(o.effectiveCodeLines)} hint={`across ${fmt(o.effectiveFiles)} files`} tone={effTone} />
        <Kpi label="Share of non-test code" value={o.effectivePercent === null ? "n/a" : `${o.effectivePercent}%`} tone={effTone} />
        <Kpi label="Scaffolding lines" value={fmt(o.boilerplateLines)} hint={`${fmt(o.boilerplateFiles)} template files`} />
        <Kpi
          label="Highest overlap"
          value={topMatch ? `${topMatch.peakPercent}%` : "none"}
          hint={topMatch ? topMatch.fullName : "no matching submissions"}
          tone={topMatch ? (topMatch.peakPercent >= 25 ? "danger" : "warning") : "success"}
        />
      </div>

      <div className="grid grid-2">
        <Card title="Code composition" subtitle="Where the lines in this repository come from.">
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={composition} layout="vertical" margin={{ top: 8, right: 16, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf3" horizontal={false} />
                <XAxis type="number" {...chartAxis} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" {...chartAxis} tickLine={false} axisLine={false} width={120} />
                <Tooltip {...chartTooltip} cursor={{ fill: "#f1f4fa" }} />
                <Bar dataKey="lines" name="Lines" fill="#2457d6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {o.effectivePercent !== null && <ProgressBar value={o.effectivePercent} tone={effTone} />}
          <p className="footnote">Scaffolding and generated files are excluded from the originality score and from overlap matching.</p>
        </Card>

        <Card title="Detected project templates" subtitle="Starter kits recognised from their marker files.">
          {o.templates.length === 0 ? (
            <div className="table-empty">No known starter template detected; the project structure looks hand-built.</div>
          ) : (
            <div className="chips" style={{ marginBottom: 12 }}>
              {o.templates.map((t) => (
                <span key={t.name} className="chip">
                  {t.name} <Badge tone={t.confidence === "high" ? "info" : "neutral"}>{t.confidence}</Badge>
                </span>
              ))}
            </div>
          )}
          <StatLine label="Files never changed after being added" value={`${fmt(o.untouchedFiles)} (${fmt(o.untouchedLines)} lines)`} />
          <StatLine label="Code blocks fingerprinted" value={fmt(o.fingerprintBlocks)} />
          {o.boilerplateSamples.length > 0 && (
            <>
              <div className="kpi-label" style={{ marginTop: 12, marginBottom: 6 }}>Largest template files</div>
              <DataTable
                columns={[
                  { key: "path", label: "File", path: true },
                  { key: "lines", label: "Lines", num: true },
                ]}
                rows={o.boilerplateSamples.slice(0, 5)}
              />
            </>
          )}
        </Card>
      </div>

      <Card
        title="Overlap with other analyzed repositories"
        subtitle="Matching blocks of 6+ consecutive code lines, ignoring scaffolding. Every repository you analyze is added to this comparison set."
      >
        <DataTable
          columns={[
            { key: "fullName", label: "Repository", render: (r) => <a href={r.repoUrl} target="_blank" rel="noreferrer">{r.fullName}</a> },
            { key: "sharedBlocks", label: "Shared blocks", num: true, render: (r) => fmt(r.sharedBlocks) },
            { key: "similarityPercent", label: "Of this repo", num: true, render: (r) => `${r.similarityPercent}%` },
            { key: "coveragePercent", label: "Of that repo", num: true, render: (r) => `${r.coveragePercent}%` },
            {
              key: "peakPercent",
              label: "Flag",
              render: (r) => <Badge tone={r.peakPercent >= 25 ? "danger" : "warning"}>{r.peakPercent >= 25 ? "investigate" : "review"}</Badge>,
            },
          ]}
          rows={o.similarSubmissions}
          empty="No overlap found with any previously analyzed repository."
        />
        <p className="footnote">
          Overlap is evidence to check by hand, not proof of copying: shared tutorials, common libraries and forked starter code all produce matches.
        </p>
      </Card>

      {o.untouchedSamples.length > 0 && (
        <Card title="Files never modified after their first commit" subtitle="Often untouched template or pasted code. Worth a look when they carry a lot of lines.">
          <DataTable
            columns={[
              { key: "path", label: "File", path: true },
              { key: "lines", label: "Lines", num: true },
            ]}
            rows={o.untouchedSamples}
          />
        </Card>
      )}
    </Section>
  );
}
