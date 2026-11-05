import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, DataTable, Kpi, ProgressBar, Section, StatLine, chartAxis, chartColors, chartTooltip, fmt, scoreTone } from "../ui";

const functionColumns = [
  { key: "name", label: "Function", render: (r) => <span className="mono">{r.name}</span> },
  { key: "file", label: "File", path: true },
  { key: "line", label: "Line", num: true },
  { key: "length", label: "Lines", num: true },
  { key: "complexity", label: "Complexity", num: true },
  { key: "nesting", label: "Nesting", num: true },
];

export default function Quality({ data }) {
  const { summary, languageBreakdown, functions: fn, duplication, largestFiles, mostComplexFiles } = data;
  const languageData = languageBreakdown.map((l) => ({ name: l.language, lines: l.totalLines, files: l.files }));
  const dupTone = duplication.duplicationPercent >= 10 ? "danger" : duplication.duplicationPercent >= 5 ? "warning" : "success";

  return (
    <Section id="sec-quality" title="Code quality" description="Function-level structure, complexity, nesting and duplication across source files (tests excluded from function metrics).">
      <div className="grid grid-4">
        <Kpi label="Maintainability index" value={summary.maintainabilityIndex ?? "n/a"} hint="0-100, higher is better" />
        <Kpi label="Avg complexity" value={fn.avgComplexity} hint={`max ${fn.maxComplexity} per function`} tone={fn.avgComplexity > 6 ? "warning" : undefined} />
        <Kpi label="Avg function length" value={`${fn.avgLength}`} hint={`median ${fn.medianLength}, max ${fn.maxLength} lines`} />
        <Kpi label="Comment ratio" value={`${summary.commentRatioPercent}%`} hint={`${fmt(summary.totalCommentLines)} comment lines`} />
      </div>

      <div className="grid grid-2">
        <Card title="Lines of code by language">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={languageData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf3" vertical={false} />
                <XAxis dataKey="name" {...chartAxis} tickLine={false} />
                <YAxis {...chartAxis} tickLine={false} axisLine={false} />
                <Tooltip {...chartTooltip} cursor={{ fill: "#f1f4fa" }} />
                <Bar isAnimationActive={false} dataKey="lines" name="Lines" fill="#2457d6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Files by language">
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie isAnimationActive={false} data={languageData} dataKey="files" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {languageData.map((_, i) => (
                    <Cell key={i} fill={chartColors[i % chartColors.length]} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltip} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Function size distribution" subtitle={`${fmt(fn.analyzed)} functions analyzed`}>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fn.lengthDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf3" vertical={false} />
                <XAxis dataKey="bucket" {...chartAxis} tickLine={false} />
                <YAxis {...chartAxis} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...chartTooltip} cursor={{ fill: "#f1f4fa" }} />
                <Bar isAnimationActive={false} dataKey="count" name="Functions" fill="#0e9f8e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Complexity & nesting">
          <StatLine label={`Functions over ${fn.longThreshold} lines`} value={fmt(fn.longCount)} />
          <StatLine label={`Functions with complexity above ${fn.complexityThreshold}`} value={fmt(fn.highComplexityCount)} />
          <StatLine label="Average max nesting depth" value={fn.avgNesting} />
          <StatLine label="Deepest nesting" value={fn.deepestNesting} />
          <StatLine label={`Functions nested ${fn.nestingThreshold}+ levels`} value={fmt(fn.deepCount)} />
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Longest functions">
          <DataTable columns={functionColumns} rows={fn.longest} empty="No functions analyzed." />
        </Card>
        <Card title="Most complex functions">
          <DataTable columns={functionColumns} rows={fn.mostComplex} empty="No functions analyzed." />
        </Card>
      </div>

      <Card title="Most deeply nested functions" subtitle="Nesting depth counts nested if/for/while/switch/try blocks inside the function.">
        <DataTable columns={functionColumns} rows={fn.deepest.filter((f) => f.nesting > 0)} empty="No nested control flow found." />
      </Card>

      <Card
        title="Code duplication"
        subtitle={`Repeated blocks of ${duplication.windowSize}+ consecutive normalized lines across source files`}
        action={<Badge tone={dupTone}>{duplication.duplicationPercent}% duplicated</Badge>}
      >
        <div className="grid grid-2">
          <div>
            <div className="big-number">{duplication.duplicationPercent}%</div>
            <div className="card-sub" style={{ marginBottom: 10 }}>
              {fmt(duplication.duplicatedLines)} of {fmt(duplication.analyzedLines)} meaningful code lines
            </div>
            <ProgressBar value={Math.min(100, duplication.duplicationPercent * 5)} tone={dupTone} />
            <p className="footnote">{fmt(duplication.filesWithDuplication)} file(s) contain duplicated blocks.</p>
          </div>
          <DataTable
            columns={[
              { key: "path", label: "Most duplicated files", path: true },
              { key: "duplicatedLines", label: "Lines", num: true },
              { key: "percent", label: "Share", num: true, render: (r) => `${r.percent}%` },
            ]}
            rows={duplication.topFiles.slice(0, 6)}
            empty="No duplicated blocks found."
          />
        </div>
      </Card>

      <div className="grid grid-2">
        <Card title="Largest files">
          <DataTable
            columns={[
              { key: "path", label: "File", path: true },
              { key: "language", label: "Language" },
              { key: "totalLines", label: "Lines", num: true, render: (r) => fmt(r.totalLines) },
            ]}
            rows={largestFiles}
          />
        </Card>
        <Card title="Most complex files" subtitle="Total cyclomatic complexity per file (source only)">
          <DataTable
            columns={[
              { key: "path", label: "File", path: true },
              { key: "language", label: "Language" },
              { key: "cyclomaticComplexity", label: "Complexity", num: true },
            ]}
            rows={mostComplexFiles}
          />
        </Card>
      </div>
    </Section>
  );
}
