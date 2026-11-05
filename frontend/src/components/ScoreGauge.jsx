const GRADE_COLORS = {
  A: "#12804a",
  B: "#4d9a1f",
  C: "#c98a0b",
  D: "#d2691e",
  F: "#c0302f",
};

export default function ScoreGauge({ score, grade }) {
  const color = GRADE_COLORS[grade] || "#8792a5";
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="score-gauge">
      <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Overall score ${score} out of 100, grade ${grade}`}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e8ecf3" strokeWidth="11" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
        <text x="70" y="68" textAnchor="middle" fontSize="32" fontWeight="700" fill="#1a2233">
          {score}
        </text>
        <text x="70" y="88" textAnchor="middle" fontSize="12" fill="#536074">
          out of 100
        </text>
      </svg>
      <div className="score-caption">
        Overall grade <strong style={{ color }}>{grade}</strong>
      </div>
    </div>
  );
}
