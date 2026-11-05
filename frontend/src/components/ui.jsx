export const fmt = (n) => (n === null || n === undefined ? "n/a" : Number(n).toLocaleString());

export function scoreTone(score) {
  if (score === null || score === undefined) return "neutral";
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "danger";
}

export function Card({ title, subtitle, action, children, className = "" }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <div className="card-sub">{subtitle}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Section({ id, title, description, children }) {
  return (
    <section id={id} className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone ? `tone-${tone}` : ""}`}>{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function ProgressBar({ value, tone }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="progress">
      <span className={`bar-${tone || scoreTone(pct)}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatLine({ label, value }) {
  return (
    <div className="stat-line">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function DataTable({ columns, rows, empty = "Nothing to show." }) {
  if (!rows || rows.length === 0) return <div className="table-empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.num ? "num" : ""}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={`${c.num ? "num" : ""} ${c.path ? "path-cell" : ""}`} title={c.path ? String(row[c.key]) : undefined}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const chartColors = ["#2457d6", "#0e9f8e", "#e08a1e", "#8b5cf6", "#d6456b", "#3aa0e8", "#7cb342", "#5b6678"];
export const chartAxis = { stroke: "#8792a5", fontSize: 12 };
export const chartTooltip = {
  contentStyle: { background: "#fff", border: "1px solid #e3e8ef", borderRadius: 8, boxShadow: "0 4px 14px rgba(20,30,55,0.08)", fontSize: 12 },
};

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
