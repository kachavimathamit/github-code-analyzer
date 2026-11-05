import ScoreGauge from "./ScoreGauge";
import { Card } from "./ui";
import Overview from "./sections/Overview";
import Quality from "./sections/Quality";
import Authorship from "./sections/Authorship";
import Originality from "./sections/Originality";
import Robustness from "./sections/Robustness";
import Architecture from "./sections/Architecture";
import { Security, Dependencies } from "./sections/Security";
import { Testing, Hygiene } from "./sections/Hygiene";
import Repository from "./sections/Repository";

const NAV = [
  ["sec-overview", "Overview"],
  ["sec-authorship", "Authorship"],
  ["sec-originality", "Originality"],
  ["sec-quality", "Code quality"],
  ["sec-robustness", "Robustness"],
  ["sec-testing", "Testing"],
  ["sec-security", "Security"],
  ["sec-dependencies", "Dependencies"],
  ["sec-architecture", "Architecture"],
  ["sec-hygiene", "Hygiene"],
  ["sec-repository", "Repository"],
];

export default function Dashboard({ data, onReanalyze, busy }) {
  const { repo, summary } = data;
  const legacy = !data.analysisVersion || data.analysisVersion < 3;

  return (
    <div className="dashboard">
      <Card>
        <div className="repo-header">
          <div>
            <h2>
              <a href={repo.url} target="_blank" rel="noreferrer">
                {repo.fullName}
              </a>
            </h2>
            {repo.description && <p className="repo-desc">{repo.description}</p>}
            <div className="chips">
              <span className="chip">{repo.stars.toLocaleString()} stars</span>
              <span className="chip">{repo.forks.toLocaleString()} forks</span>
              <span className="chip">branch: {repo.defaultBranch}</span>
              {repo.language && <span className="chip">{repo.language}</span>}
            </div>
          </div>
          {!legacy && <ScoreGauge score={summary.overallScore} grade={summary.grade} />}
        </div>
      </Card>

      {legacy ? (
        <div className="notice notice-info">
          <span>This analysis was created with an earlier version and does not include the newer metrics.</span>
          <button className="btn btn-secondary" disabled={busy} onClick={() => onReanalyze(repo.url)}>
            Re-analyze
          </button>
        </div>
      ) : (
        <>
          <nav className="section-nav" aria-label="Dashboard sections">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
          <Overview data={data} />
          <Authorship data={data} />
          <Originality data={data} />
          <Quality data={data} />
          <Robustness data={data} />
          <Testing data={data} />
          <Security data={data} />
          <Dependencies data={data} />
          <Architecture data={data} />
          <Hygiene data={data} />
          <Repository data={data} />
        </>
      )}
    </div>
  );
}
