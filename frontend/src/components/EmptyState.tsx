export function EmptyState({
  title, body, action,
}: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}