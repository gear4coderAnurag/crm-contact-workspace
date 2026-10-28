import { useEffect, useState } from 'react';
import { useCompanies } from '../api/hooks';

type Props = { value: string; onChange: (v: string) => void };

export function CompanyFilter({ value, onChange }: Props) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const { data } = useCompanies(text.trim());
  const options = data?.data ?? [];

  // Company filter is an exact match, so commit on pick / Enter / blur, not while typing.
  const commit = (v: string) => v.trim() !== value && onChange(v.trim());

  return (
    <label>
      Company
      <input
        list="companies"
        value={text}
        placeholder="Exact company"
        onChange={(e) => {
          setText(e.target.value);
          if (options.includes(e.target.value)) commit(e.target.value);
        }}
        onBlur={() => commit(text)}
        onKeyDown={(e) => e.key === 'Enter' && commit(text)}
      />
      <datalist id="companies">{options.map((c) => <option key={c} value={c} />)}</datalist>
    </label>
  );
}
