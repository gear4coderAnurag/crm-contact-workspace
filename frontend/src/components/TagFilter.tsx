import { useTags } from '../api/hooks';

type Props = { value: string; onChange: (v: string) => void };

export function TagFilter({ value, onChange }: Props) {
  const { data } = useTags();
  return (
    <label>
      Tag
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All tags</option>
        {data?.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}
