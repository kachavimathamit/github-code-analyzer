import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import { Badge, Card, Kpi, ProgressBar, Section, fmt, formatBytes, scoreTone } from "../ui";

const SEVERITY_TONE = { high: "danger", medium: "warning", low: "info" };

export default function Overview({ data }) {
  const { summary, categories, recommendations } = data;
  const scored = categories.filter((c) => c.score !== null);
  const radarData = scored.map((c) => ({ subject: c.label, score: c.score }));

  return (
    <Section id="sec-overview" title="Overview" description="Repository size and a weighted score for each quality dimension.">
      <div className="grid grid-4">
        <Kpi label="Files" value={fmt(summary.totalFiles)} hint={`${fmt(summary.analyzedFiles)} analyzed`} />
        <Kpi label="Total lines" value={fmt(summary.totalLines)} hint={`${fmt(summary.totalCodeLines)} code lines`} />
        <Kpi label="Functions" value={fmt(summary.totalFunctions)} hint={`avg ${summary.avgFunctionsPerFile} per file`} />
        <Kpi label="Repository size" value={formatBytes(summary.totalBytes)} hint={summary.truncated ? "Truncated to first 8,000 files" : undefined} />
      </div>

      <Card title="Quality scorecard" subtitle="Each category is scored 0-100; the overall grade is a weighted average of available categories.">
        <div style={{ height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%" margin={{ top: 16, right: 80, bottom: 16, left: 80 }}>
              <PolarGrid stroke="#dfe5ee" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: "#536074", fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#2457d6" fill="#2457d6" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="score-grid">
          {categories.map((c) => (
            <div key={c.key}>
              <div className="score-row-top">
                <span className="score-row-label">
                  {c.label}
                  <span className="score-row-weight">weight {c.weight}%</span>
                </span>
                {c.score === null ? <Badge>n/a</Badge> : <Badge tone={scoreTone(c.score)}>{c.score}</Badge>}
              </div>
              <ProgressBar value={c.score ?? 0} />
              <div className="score-row-detail">{c.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Recommendations" subtitle="Highest-impact improvements based on the metrics below.">
        {recommendations.length === 0 ? (
          <div className="table-empty">No significant issues detected.</div>
        ) : (
          <ul className="rec-list">
            {recommendations.map((r, i) => (
              <li key={i} className="rec-item">
                <Badge tone={SEVERITY_TONE[r.severity]}>{r.severity}</Badge>
                <div>
                  <div className="rec-title">{r.title}</div>
                  <div className="rec-detail">{r.detail}</div>
                  <div className="rec-cat">{r.category}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Section>
  );
}
