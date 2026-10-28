export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="box error" role="alert">
      {error.message} {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}
