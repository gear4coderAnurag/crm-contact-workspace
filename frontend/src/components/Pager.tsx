type Props = { canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void; loading: boolean };

export function Pager({ canPrev, canNext, onPrev, onNext, loading }: Props) {
  return (
    <div className="pager">
      <button onClick={onPrev} disabled={!canPrev}>← Prev</button>
      <button onClick={onNext} disabled={!canNext}>Next →</button>
      {loading && <span className="muted">Loading…</span>}
    </div>
  );
}
