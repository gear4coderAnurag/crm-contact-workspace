type Sort = 'created_at' | 'name';
type Order = 'asc' | 'desc';
type Props = { sort: Sort; order: Order; onChange: (sort: Sort, order: Order) => void };

const OPTIONS: { label: string; sort: Sort; order: Order }[] = [
  { label: 'Newest first', sort: 'created_at', order: 'desc' },
  { label: 'Oldest first', sort: 'created_at', order: 'asc' },
  { label: 'Name A–Z', sort: 'name', order: 'asc' },
  { label: 'Name Z–A', sort: 'name', order: 'desc' },
];

export function SortSelect({ sort, order, onChange }: Props) {
  return (
    <label>
      Sort
      <select
        value={`${sort}:${order}`}
        onChange={(e) => {
          const o = OPTIONS.find((x) => `${x.sort}:${x.order}` === e.target.value);
          if (o) onChange(o.sort, o.order);
        }}
      >
        {OPTIONS.map((o) => <option key={o.label} value={`${o.sort}:${o.order}`}>{o.label}</option>)}
      </select>
    </label>
  );
}
