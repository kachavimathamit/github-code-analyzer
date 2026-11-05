import { Badge, Card, DataTable, Kpi, ProgressBar, Section, StatLine, fmt } from "../ui";

export function Testing({ data }) {
  const t = data.testing;
  const ratio = t.testToSourceRatioPercent;
  const tone = !t.hasTests ? "danger" : ratio >= 25 ? "success" : ratio >= 10 ? "warning" : "danger";

  return (
    <Section id="sec-testing" title="Testing" description="Test coverage proxy based on the size of test code relative to source code (tests are not executed).">
      <div className="grid grid-4">
        <Kpi label="Test files" value={fmt(t.testFiles)} tone={t.hasTests ? undefined : "danger"} />
        <Kpi label="Source files" value={fmt(t.sourceFiles)} />
        <Kpi label="Test code lines" value={fmt(t.testLines)} hint={`${fmt(t.sourceLines)} source lines`} />
        <Kpi label="Test-to-source ratio" value={ratio === null ? "n/a" : `${ratio}%`} tone={tone === "success" ? "success" : tone === "danger" ? "danger" : "warning"} />
      </div>
      <Card title="Test posture">
        <ProgressBar value={Math.min(100, (ratio || 0) * 2.5)} tone={tone} />
        <p className="footnote">A ratio of 40% or more earns full marks in the scorecard.</p>
        <div style={{ marginTop: 10 }}>
          <StatLine label="Test frameworks detected" value={t.frameworks && t.frameworks.length ? t.frameworks.join(", ") : "none detected"} />
          <StatLine label="CI configuration" value={<Badge tone={t.hasCI ? "success" : "warning"}>{t.hasCI ? "present" : "missing"}</Badge>} />
        </div>
      </Card>
    </Section>
  );
}

export function Hygiene({ data }) {
  const { todos, naming, deadCode } = data;

  return (
    <Section id="sec-hygiene" title="Code hygiene" description="Maintenance markers, naming conventions and potentially unused code.">
      <div className="grid grid-4">
        <Kpi label="TODO / FIXME markers" value={fmt(todos.total)} hint={`${todos.densityPer1kLines} per 1k code lines`} tone={todos.densityPer1kLines > 5 ? "warning" : undefined} />
        <Kpi label="Naming consistency" value={naming.consistencyPercent === null ? "n/a" : `${naming.consistencyPercent}%`} hint={naming.dominantStyle ? `dominant: ${naming.dominantStyle}` : undefined} tone={naming.consistencyPercent !== null && naming.consistencyPercent < 80 ? "warning" : undefined} />
        <Kpi label="Very short names" value={`${naming.shortNamePercent}%`} hint={`${fmt(naming.shortNameCount)} of ${fmt(naming.totalNames)} identifiers`} />
        <Kpi label="Unused code (heuristic)" value={fmt(deadCode.unusedCount)} hint={`of ${fmt(deadCode.candidates)} exports/functions`} tone={deadCode.unusedPercent > 40 ? "warning" : undefined} />
      </div>

      <div className="grid grid-2">
        <Card title="Maintenance markers" subtitle="Counted in comments only">
          <div className="grid grid-4" style={{ marginBottom: 12 }}>
            {todos.byMarker.map((m) => (
              <div key={m.marker}>
                <div className="kpi-label">{m.marker}</div>
                <div className="kpi-value" style={{ fontSize: 20 }}>{m.count}</div>
              </div>
            ))}
          </div>
          <DataTable
            columns={[
              { key: "marker", label: "Marker", render: (r) => <Badge tone={r.marker === "TODO" ? "neutral" : "warning"}>{r.marker}</Badge> },
              { key: "file", label: "Location", path: true, render: (r) => `${r.file}:${r.line}` },
              { key: "text", label: "Comment" },
            ]}
            rows={todos.items}
            empty="No TODO, FIXME, HACK or XXX markers found."
          />
        </Card>

        <Card title="Naming conventions" subtitle="Declared variables and functions">
          <StatLine label="camelCase" value={fmt(naming.camelCase)} />
          <StatLine label="snake_case" value={fmt(naming.snakeCase)} />
          <StatLine label="PascalCase" value={fmt(naming.pascalCase)} />
          <StatLine label="CONSTANT_CASE" value={fmt(naming.constants)} />
          {naming.shortNameExamples.length > 0 && (
            <>
              <div className="kpi-label" style={{ marginTop: 14, marginBottom: 6 }}>Most frequent very short names</div>
              <div className="chips">
                {naming.shortNameExamples.map((s) => (
                  <span key={s.name} className="chip mono">{s.name} x{s.count}</span>
                ))}
              </div>
            </>
          )}
          <p className="footnote">Consistency measures how much of each language's code follows its dominant style (camelCase vs snake_case).</p>
        </Card>
      </div>

      <Card title="Potentially unused code" subtitle="Exports (JS/TS) and top-level functions (Python) that no other file references. Public library APIs may appear here as false positives.">
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (r) => <span className="mono">{r.name}</span> },
            { key: "kind", label: "Kind", render: (r) => <Badge>{r.kind}</Badge> },
            { key: "file", label: "Location", path: true, render: (r) => `${r.file}:${r.line}` },
          ]}
          rows={deadCode.items}
          empty="No unused exports or functions detected."
        />
      </Card>
    </Section>
  );
}
