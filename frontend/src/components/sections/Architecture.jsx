import { Badge, Card, DataTable, Kpi, ProgressBar, Section, StatLine, fmt, scoreTone } from "../ui";

export default function Architecture({ data }) {
  const arch = data.architecture;
  if (!arch) return null;
  const { graph, folders, readme, completeness } = arch;

  return (
    <Section
      id="sec-architecture"
      title="Architecture & completeness"
      description="How the code is organised into modules, and whether the project ships what a reviewer needs to run it."
    >
      <div className="grid grid-4">
        <Kpi label="Source modules" value={fmt(graph.modules)} hint={`${fmt(graph.internalEdges)} internal imports`} />
        <Kpi label="Avg imports per file" value={graph.avgImportsPerFile} hint={`${fmt(graph.externalPackages)} external packages`} />
        <Kpi label="Circular imports" value={fmt(graph.circularCount)} tone={graph.circularCount ? "warning" : "success"} />
        <Kpi label="Project checks passed" value={`${completeness.satisfied}/${completeness.applicable}`} tone={scoreTone(completeness.percent)} />
      </div>

      <div className="grid grid-2">
        <Card title="README quality" action={readme.present ? <Badge tone={scoreTone(readme.score)}>{readme.score}/100</Badge> : <Badge tone="danger">missing</Badge>}>
          {!readme.present ? (
            <div className="table-empty">No README file was found in this repository.</div>
          ) : (
            <>
              <ProgressBar value={readme.score} />
              <div style={{ marginTop: 12 }}>
                <StatLine label="Length" value={`${fmt(readme.words)} words`} />
                <StatLine label="Headings" value={fmt(readme.headings)} />
                <StatLine label="Command / code blocks" value={fmt(readme.codeBlocks)} />
                <StatLine label="Images or screenshots" value={fmt(readme.images)} />
              </div>
              <div className="kpi-label" style={{ marginTop: 12, marginBottom: 6 }}>Expected sections</div>
              <ul className="checklist">
                {readme.sections.map((s) => (
                  <li key={s.key}>
                    <span>{s.label}</span>
                    <Badge tone={s.found ? "success" : "warning"}>{s.found ? "found" : "missing"}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Project completeness" subtitle="What a grader needs in order to install, run and review the project.">
          <ul className="checklist">
            {completeness.checks.map((c) => (
              <li key={c.key}>
                <span>{c.label}</span>
                {c.na ? <Badge>not applicable</Badge> : <Badge tone={c.ok ? "success" : "warning"}>{c.ok ? "present" : "missing"}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {graph.circularCount > 0 && (
        <Card title="Circular import chains" subtitle="Modules that depend on each other in a loop, which makes them hard to test or reuse in isolation.">
          <ul className="rec-list">
            {graph.circular.map((c, i) => (
              <li key={i} className="rec-item">
                <Badge tone="warning">cycle</Badge>
                <span className="mono">{c}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-2">
        <Card title="Most depended-on modules" subtitle="High fan-in: changing these affects many files.">
          <DataTable
            columns={[
              { key: "file", label: "File", path: true },
              { key: "fanIn", label: "Imported by", num: true },
              { key: "fanOut", label: "Imports", num: true },
            ]}
            rows={graph.mostDepended}
            empty="No internal imports were resolved."
          />
        </Card>
        <Card title="Most coupled modules" subtitle="High fan-out: these files pull in many others.">
          <DataTable
            columns={[
              { key: "file", label: "File", path: true },
              { key: "fanOut", label: "Imports", num: true },
              { key: "fanIn", label: "Imported by", num: true },
            ]}
            rows={graph.mostCoupled}
            empty="No internal imports were resolved."
          />
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Folder structure" action={folders.flatLayout ? <Badge tone="warning">flat layout</Badge> : <Badge tone="success">organised</Badge>}>
          <StatLine label="Folders containing source" value={fmt(folders.folderCount)} />
          <StatLine label="Maximum nesting depth" value={fmt(folders.maxDepth)} />
          <StatLine label="Average files per folder" value={folders.avgFilesPerFolder} />
          <StatLine label="Source files in repository root" value={fmt(folders.rootFileCount)} />
          {folders.flatLayout && <p className="footnote">Most source files sit in the root folder; grouping them into modules would make the project easier to navigate.</p>}
        </Card>
        <Card title="Top-level directories">
          <DataTable
            columns={[
              { key: "name", label: "Directory", render: (d) => <span className="mono">{d.name}</span> },
              { key: "files", label: "Source files", num: true },
            ]}
            rows={folders.topLevelDirs}
          />
        </Card>
      </div>

      {graph.topExternal.length > 0 && (
        <Card title="Most used external packages">
          <div className="chips">
            {graph.topExternal.map((p) => (
              <span key={p.name} className="chip mono">
                {p.name} x{p.count}
              </span>
            ))}
          </div>
        </Card>
      )}
    </Section>
  );
}
