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
      const items = await fetchHistory();
      setHistory(items);
    } catch {
      // history is non-critical; ignore failures silently
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await analyzeRepo(repoUrl.trim());
      setResult(data);
      refreshHistory();
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleHistorySelect(id) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchAnalysisById(id);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🔍 GitHub Code Analyzer</h1>
        <p>Paste a public GitHub repository link to measure code quality, complexity, and maintainability.</p>
      </header>

      <form className="analyze-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="https://github.com/owner/repo"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="loading-banner">Cloning repository and computing metrics... this can take a moment for large repos.</div>}

      <div className="main-layout">
        <div className="main-content">
          {result ? <Dashboard data={result} /> : !loading && <div className="empty-state">Your analysis results will appear here.</div>}
        </div>
        <aside className="sidebar">
          <h3>Recent Analyses</h3>
          <History items={history} onSelect={handleHistorySelect} />
        </aside>
      </div>
    </div>
  );
}
