import { Badge, Card, DataTable, Kpi, Section, StatLine, fmt } from "../ui";

const SEVERITY_TONE = { high: "danger", medium: "warning", low: "info" };

export function Security({ data }) {
  const { secrets, vulnerabilities } = data;

  return (
    <Section id="sec-security" title="Security" description="Static scan for committed credentials and known advisories (OSV.dev) in direct dependencies.">
      <div className="grid grid-4">
        <Kpi label="Secret findings" value={fmt(secrets.total)} hint={`${secrets.filesAffected} file(s)`} tone={secrets.high ? "danger" : secrets.medium ? "warning" : "success"} />
        <Kpi label="High severity" value={fmt(secrets.high)} tone={secrets.high ? "danger" : undefined} />
        <Kpi label="Vulnerable packages" value={vulnerabilities.available ? fmt(vulnerabilities.vulnerablePackages) : "n/a"} hint={vulnerabilities.available ? `${fmt(vulnerabilities.totalAdvisories)} advisories` : "Lookup unavailable"} tone={vulnerabilities.vulnerablePackages ? "warning" : undefined} />
        <Kpi label="Packages checked" value={vulnerabilities.available ? fmt(vulnerabilities.checked) : "n/a"} hint={vulnerabilities.approximate ? "Versions estimated from ranges" : undefined} />
      </div>

      <Card title="Hardcoded secrets" subtitle="Values are masked. Findings in test paths are rated low.">
        <DataTable
          columns={[
            { key: "severity", label: "Severity", render: (r) => <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge> },
            { key: "type", label: "Type" },
            { key: "file", label: "File", path: true },
            { key: "line", label: "Line", num: true, render: (r) => r.line ?? "-" },
            { key: "preview", label: "Match", render: (r) => <span className="mono">{r.preview}</span> },
          ]}
          rows={secrets.findings}
          empty="No hardcoded secrets or sensitive files detected."
        />
        {secrets.total > secrets.findings.length && <p className="footnote">Showing {secrets.findings.length} of {secrets.total} findings.</p>}
      </Card>

      <Card title="Known vulnerabilities" subtitle="Direct dependencies matched against the OSV.dev advisory database.">
        {!vulnerabilities.available ? (
          <div className="table-empty">No supported dependency manifest found, or the advisory service was unreachable.</div>
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "Package", render: (r) => <span className="mono">{r.name}</span> },
              { key: "version", label: "Version", render: (r) => <span className="mono">{r.version}</span> },
              { key: "dev", label: "Scope", render: (r) => <Badge>{r.dev ? "dev" : "prod"}</Badge> },
              { key: "count", label: "Advisories", num: true },
              {
                key: "ids",
                label: "IDs",
                render: (r) => r.ids.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ", "}
                    <a href={`https://osv.dev/vulnerability/${id}`} target="_blank" rel="noreferrer">{id}</a>
                  </span>
                )),
              },
            ]}
            rows={vulnerabilities.list}
            empty="No known advisories for the checked packages."
          />
        )}
      </Card>
    </Section>
  );
}

export function Dependencies({ data }) {
  const { dependencies: d } = data;

  return (
    <Section id="sec-dependencies" title="Dependencies" description="Direct dependency health from package.json and requirements.txt, checked against the npm and PyPI registries.">
      {d.totalDirect === 0 ? (
        <Card>
          <div className="table-empty">No supported dependency manifest (package.json, requirements.txt) found in this repository.</div>
        </Card>
      ) : (
        <>
          <div className="grid grid-4">
            <Kpi label="Direct dependencies" value={fmt(d.totalDirect)} hint={`${d.prodCount} prod, ${d.devCount} dev`} />
            <Kpi label="Major versions behind" value={fmt(d.outdatedMajor)} hint={`of ${d.checked} checked`} tone={d.outdatedMajor >= 3 ? "warning" : undefined} />
            <Kpi label="Deprecated" value={fmt(d.deprecated)} tone={d.deprecated ? "danger" : "success"} />
            <Kpi label="Unpinned versions" value={fmt(d.unpinned)} hint='"*" or "latest"' tone={d.unpinned ? "warning" : undefined} />
          </div>
          <div className="grid grid-2">
            <Card title="Outdated dependencies" subtitle="At least one major version behind the latest release.">
              <DataTable
                columns={[
                  { key: "name", label: "Package", render: (r) => <span className="mono">{r.name}</span> },
                  { key: "current", label: "Current", render: (r) => <span className="mono">{r.current}</span> },
                  { key: "latest", label: "Latest", render: (r) => <span className="mono">{r.latest}</span> },
                  { key: "majorsBehind", label: "Behind", num: true, render: (r) => `${r.majorsBehind} major` },
                ]}
                rows={d.outdatedList}
                empty="All checked dependencies are on the latest major version."
              />
            </Card>
            <div className="grid" style={{ alignContent: "start" }}>
              <Card title="Deprecated packages">
                <DataTable
                  columns={[
                    { key: "name", label: "Package", render: (r) => <span className="mono">{r.name}</span> },
                    { key: "message", label: "Notice" },
                  ]}
                  rows={d.deprecatedList}
                  empty="No deprecated packages."
                />
              </Card>
              <Card title="Manifests">
                <DataTable
                  columns={[
                    { key: "path", label: "File", path: true },
                    { key: "ecosystem", label: "Ecosystem" },
                    { key: "prod", label: "Prod", num: true },
                    { key: "dev", label: "Dev", num: true },
                    { key: "lockfile", label: "Lockfile", render: (r) => (r.ecosystem === "npm" ? (r.lockfile ? "yes" : "no") : "-") },
                  ]}
                  rows={d.manifests}
                />
              </Card>
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
