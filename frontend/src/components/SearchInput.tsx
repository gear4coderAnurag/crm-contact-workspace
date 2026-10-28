import { useEffect, useState } from 'react';

type Props = { value: string; onChange: (v: string) => void };

export function SearchInput({ value, onChange }: Props) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  const trimmed = text.trim();
  const tooShort = trimmed.length === 1;

  useEffect(() => {
    if (tooShort) return; // invalid input is never sent to the API
    const next = trimmed;
    if (next === value) return;
    const t = setTimeout(() => onChange(next), 300);
    return () => clearTimeout(t);
  }, [trimmed, tooShort, value, onChange]);

  return (
    <label>
      Search
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Name, email or phone" maxLength={100} aria-invalid={tooShort} />
      {tooShort && <span className="hint">Enter at least 2 characters</span>}
    </label>
  );
}
