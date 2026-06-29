interface EmptyStateProps {
  title: string;
  hint?: string;
}

export default function EmptyState({ title, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h4>{title}</h4>
      {hint && <p>{hint}</p>}
    </div>
  );
}
