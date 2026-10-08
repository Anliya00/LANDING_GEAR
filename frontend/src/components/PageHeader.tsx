export function PageHeader({
  title, description, actions, banner
}: { title: string; description?: string; actions?: React.ReactNode; banner?: boolean }) {
  return (
    <div className={`page-header ${banner ? 'page-header-banner' : ''}`}>
      <div className="page-header-content">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}