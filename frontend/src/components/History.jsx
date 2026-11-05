export default function History({ items, onSelect }) {
  if (!items.length) {
    return <p className="history-empty">No analyses yet. Paste a GitHub repo URL above to get started.</p>;
  }

  return (
    <ul className="history-list">
      {items.map((item) => (
        <li key={item.id} onClick={() => onSelect(item.id)}>
          <span className="history-name">{item.owner}/{item.repo_name}</span>
          <span className="history-date">{new Date(item.created_at).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}
