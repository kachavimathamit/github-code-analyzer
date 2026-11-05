import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import ScoreGauge from "./ScoreGauge";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export default function Dashboard({ data }) {
  const { repo, summary, languageBreakdown, largestFiles, mostComplexFiles } = data;

  const languageChartData = languageBreakdown.map((l) => ({
    name: l.language,
    lines: l.totalLines,
    files: l.files,
  }));

  return (
    <div className="dashboard">
      <div className="repo-header">
        <div>
          <h2>
            <a href={repo.url} target="_blank" rel="noreferrer">
              {repo.fullName}
            </a>
          </h2>
          {repo.description && <p className="repo-desc">{repo.description}</p>}
          <div className="repo-meta">
            <span>⭐ {repo.stars.toLocaleString()}</span>
            <span>🍴 {repo.forks.toLocaleString()}</span>
            <span>🌿 {repo.defaultBranch}</span>
            {repo.language && <span>🏷️ {repo.language}</span>}
          </div>
        </div>
        <ScoreGauge score={summary.overallScore} grade={summary.grade} />
      </div>

      <div className="stat-grid">
        <StatCard label="Total Files" value={summary.totalFiles.toLocaleString()} sub={`${summary.analyzedFiles} analyzed`} />
        <StatCard label="Total Lines" value={summary.totalLines.toLocaleString()} />
        <StatCard label="Code Lines" value={summary.totalCodeLines.toLocaleString()} />
        <StatCard label="Comment Lines" value={summary.totalCommentLines.toLocaleString()} sub={`${summary.commentRatioPercent}% ratio`} />
        <StatCard label="Functions" value={summary.totalFunctions.toLocaleString()} sub={`avg ${summary.avgFunctionsPerFile}/file`} />
        <StatCard label="Avg Complexity" value={summary.avgComplexityPerFile} sub="per file" />
        <StatCard label="Maintainability" value={summary.maintainabilityIndex} sub="index (0-100)" />
        <StatCard label="Repo Size" value={formatBytes(summary.totalBytes)} />
      </div>

      <div className="chart-row">
        <div className="chart-panel">
          <h3>Lines of Code by Language</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={languageChartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8 }} />
              <Bar dataKey="lines" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-panel">
          <h3>File Distribution by Language</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={languageChartData} dataKey="files" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name }) => name}>
                {languageChartData.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-row">
        <div className="table-panel">
          <h3>Largest Files</h3>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Language</th>
                <th>Lines</th>
              </tr>
            </thead>
            <tbody>
              {largestFiles.map((f) => (
                <tr key={f.path}>
                  <td className="path-cell" title={f.path}>
                    {f.path}
                  </td>
                  <td>{f.language}</td>
                  <td>{f.totalLines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-panel">
          <h3>Most Complex Files</h3>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Language</th>
                <th>Complexity</th>
              </tr>
            </thead>
            <tbody>
              {mostComplexFiles.map((f) => (
                <tr key={f.path}>
                  <td className="path-cell" title={f.path}>
                    {f.path}
                  </td>
                  <td>{f.language}</td>
                  <td>{f.cyclomaticComplexity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
