export async function analyzeRepo(repoUrl) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to analyze repository.");
  return data;
}

export async function fetchHistory(limit = 20) {
  const res = await fetch(`/api/history?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to load history.");
  return res.json();
}

export async function fetchAnalysisById(id) {
  const res = await fetch(`/api/analyze/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to load analysis.");
  return data;
}
