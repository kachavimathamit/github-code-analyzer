import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import History from "./components/History";
import { analyzeRepo, fetchHistory, fetchAnalysisById } from "./api";
import "./App.css";

export default function App() {
  const [repoUrl, setRepoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    refreshHistory();
  }, []);

  async function refreshHistory() {
    try {
      setHistory(await fetchHistory());
    } catch {
      // history is non-critical
    }
  }

  async function runAnalysis(url) {
    setLoading(true);
    setError("");
    try {
      const data = await analyzeRepo(url);
      setResult(data);
      refreshHistory();
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (repoUrl.trim()) runAnalysis(repoUrl.trim());
  }

  function handleReanalyze(url) {
    setRepoUrl(url);
    runAnalysis(url);
  }

  async function handleHistorySelect(id) {
    setLoading(true);
    setError("");
    try {
      setResult(await fetchAnalysisById(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <div>
            <div className="brand-title">GitHub Code Analyzer</div>
            <div className="brand-sub">Code quality, security and repository health reports</div>
          </div>
        </div>
      </header>

      <div className="app">
        <div className="search-card">
          <h1>Analyze a repository</h1>
          <p>Paste the link to a public GitHub repository to generate a full quality report.</p>
          <form className="analyze-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="https://github.com/owner/repository"
              aria-label="GitHub repository URL"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={loading}
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Analyzing..." : "Analyze"}
            </button>
          </form>
        </div>

        {error && <div className="notice notice-danger">{error}</div>}
        {loading && (
          <div className="notice notice-info">
            <span>
              <span className="spinner" />
              Cloning the repository and computing metrics. Large repositories can take a minute.
            </span>
          </div>
        )}

        <div className="main-layout">
          <main className="main-content">
            {result ? (
              <Dashboard data={result} onReanalyze={handleReanalyze} busy={loading} />
            ) : (
              !loading && <div className="empty-state">Your analysis report will appear here.</div>
            )}
          </main>
          <aside className="sidebar">
            <h3>Recent analyses</h3>
            <History items={history} onSelect={handleHistorySelect} />
          </aside>
        </div>
      </div>
    </>
  );
}
