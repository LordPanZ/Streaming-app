/** Estados vacíos guiados (FR-034): explican qué falta y qué hacer. */

interface EmptyStateProps {
  icon: string;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__text">{text}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn btn--primary" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

interface BannerProps {
  tone: 'warn' | 'error' | 'info';
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function Banner({ tone, children, actionLabel, onAction }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {actionLabel && onAction && (
        <span className="banner__actions">
          <button type="button" className="btn btn--sm" onClick={onAction}>
            {actionLabel}
          </button>
        </span>
      )}
    </div>
  );
}
