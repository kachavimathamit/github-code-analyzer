const GRADE_COLORS = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

export default function ScoreGauge({ score, grade }) {
  const color = GRADE_COLORS[grade] || "#94a3b8";
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="score-gauge">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="70" y="64" textAnchor="middle" fontSize="28" fontWeight="700" fill="#f1f5f9">
          {score}
        </text>
        <text x="70" y="88" textAnchor="middle" fontSize="14" fill="#94a3b8">
          / 100
        </text>
      </svg>
      <div className="score-grade" style={{ color }}>
        Grade {grade}
      </div>
    </div>
  );
}
