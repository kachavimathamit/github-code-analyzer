import { Badge, Card, DataTable, Kpi, Section, StatLine, fmt } from "../ui";

const SEVERITY_TONE = { high: "danger", medium: "warning", low: "info" };

export default function Robustness({ data }) {
  const r = data.robustness;
  if (!r) return null;

  const samples = r.groups.flatMap((g) => g.samples.map((s) => ({ ...s, groupLabel: g.label })));

  return (
    <Section
      id="sec-robustness"
      title="Robustness"
      description="Static checks for code that compiles but misbehaves: swallowed errors, injection risks, debug leftovers and oversized units."
    >
      <div className="grid grid-4">
        <Kpi label="Total findings" value={fmt(r.totalFindings)} hint={`${r.high} high, ${r.medium} medium, ${r.low} low`} tone={r.high ? "danger" : r.medium ? "warning" : "success"} />
        <Kpi label="Broken files" value={fmt(r.structuralCount)} hint="unbalanced brackets or braces" tone={r.structuralCount ? "danger" : "success"} />
        <Kpi label="Oversized files" value={fmt(r.godFileCount)} hint={`over ${r.godFileThreshold} code lines`} tone={r.godFileCount > 3 ? "warning" : undefined} />
        <Kpi label="Long parameter lists" value={fmt(r.longParamCount)} hint={`more than ${r.paramThreshold} parameters`} tone={r.longParamCount > 5 ? "warning" : undefined} />
      </div>

      <Card title="Findings by category">
        <DataTable
          columns={[
            { key: "severity", label: "Severity", render: (g) => <Badge tone={SEVERITY_TONE[g.severity]}>{g.severity}</Badge> },
            { key: "label", label: "Issue" },
            { key: "count", label: "Occurrences", num: true, render: (g) => fmt(g.count) },
            { key: "files", label: "Files", num: true },
          ]}
          rows={r.groups}
          empty="No robustness issues detected."
        />
      </Card>

      {r.structuralIssues.length > 0 && (
        <Card title="Files that do not parse cleanly" subtitle="Mismatched delimiters usually mean truncated, corrupted or conflict-damaged code.">
          <DataTable
            columns={[
              { key: "file", label: "File", path: true },
              { key: "issues", label: "Problem" },
            ]}
            rows={r.structuralIssues}
          />
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Example occurrences" subtitle="Up to five samples per category.">
          <DataTable
            columns={[
              { key: "groupLabel", label: "Issue" },
              { key: "file", label: "Location", path: true, render: (s) => `${s.file}:${s.line}` },
              { key: "snippet", label: "Code", render: (s) => <span className="mono">{s.snippet}</span> },
            ]}
            rows={samples.slice(0, 14)}
            empty="Nothing to show."
          />
        </Card>

        <div className="grid" style={{ alignContent: "start" }}>
          <Card title="Other smells">
            <StatLine label="Magic numbers" value={`${fmt(r.magicNumbers)} (${r.magicNumberDensity} per 1k lines)`} />
            <StatLine label={`Functions over ${r.paramThreshold} parameters`} value={fmt(r.longParamCount)} />
            <StatLine label={`Files over ${r.godFileThreshold} code lines`} value={fmt(r.godFileCount)} />
          </Card>
          {r.godFiles.length > 0 && (
            <Card title="Largest source files">
              <DataTable
                columns={[
                  { key: "path", label: "File", path: true },
                  { key: "codeLines", label: "Code lines", num: true, render: (f) => fmt(f.codeLines) },
                  { key: "functions", label: "Functions", num: true },
                ]}
                rows={r.godFiles}
              />
            </Card>
          )}
        </div>
      </div>
    </Section>
  );
}
