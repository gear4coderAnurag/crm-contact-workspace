import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useContacts } from '../api/hooks';
import type { ListParams } from '../api/types';
import { BulkTagBar } from '../components/BulkTagBar';
import { CompanyFilter } from '../components/CompanyFilter';
import { ContactTable, ContactTableSkeleton } from '../components/ContactTable';
import { ErrorBox } from '../components/ErrorBox';
import { Pager } from '../components/Pager';
import { SearchInput } from '../components/SearchInput';
import { SortSelect } from '../components/SortSelect';
import { TagFilter } from '../components/TagFilter';

export function ContactListPage() {
  const [sp, setSp] = useSearchParams();
  const sort = sp.get('sort') === 'name' ? 'name' : 'created_at';
  const order = sp.get('order') === 'asc' || sp.get('order') === 'desc' ? (sp.get('order') as 'asc' | 'desc') : sort === 'name' ? 'asc' : 'desc';
  const params: ListParams = {
    q: sp.get('q') ?? undefined,
    company: sp.get('company') ?? undefined,
    tagId: sp.get('tagId') ?? undefined,
    sort,
    order,
    cursor: sp.get('cursor') ?? undefined,
  };

  // cursors of the pages before this one ('' = first page); lives in state, current cursor lives in the URL
  const [stack, setStack] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { data, error, isPending, isFetching, isPlaceholderData, refetch } = useContacts(params);

  // selection is scoped to the visible page
  const pageKey = sp.toString();
  useEffect(() => setSelected(new Set()), [pageKey]);

  const setFilter = useCallback(
    (patch: Record<string, string>) => {
      setSp((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
        next.delete('cursor');
        return next;
      });
      setStack([]);
    },
    [setSp],
  );
  const setQ = useCallback((q: string) => setFilter({ q }), [setFilter]);
  const setCompany = useCallback((company: string) => setFilter({ company }), [setFilter]);

  const goCursor = (cursor: string) =>
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      cursor ? next.set('cursor', cursor) : next.delete('cursor');
      return next;
    });

  const next = () => {
    if (!data?.nextCursor) return;
    setStack([...stack, params.cursor ?? '']);
    goCursor(data.nextCursor);
  };
  const prev = () => {
    goCursor(stack[stack.length - 1] ?? '');
    setStack(stack.slice(0, -1));
  };

  const hasFilters = Boolean(params.q || params.company || params.tagId);
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => (data && data.data.every((c) => s.has(c.id)) ? new Set() : new Set(data?.data.map((c) => c.id))));

  return (
    <div>
      <h1>Contacts</h1>
      <div className="toolbar">
        <SearchInput value={params.q ?? ''} onChange={setQ} />
        <CompanyFilter value={params.company ?? ''} onChange={setCompany} />
        <TagFilter value={params.tagId ?? ''} onChange={(tagId) => setFilter({ tagId })} />
        <SortSelect sort={sort} order={order} onChange={(s, o) => setFilter({ sort: s, order: o })} />
      </div>

      <BulkTagBar selectedIds={[...selected]} onDone={() => setSelected(new Set())} />

      {isPending && <ContactTableSkeleton />}
      {error && <ErrorBox error={error} onRetry={() => void refetch()} />}
      {data && data.data.length === 0 && (
        <div className="empty">
          <p>No contacts match these filters</p>
          {hasFilters && <button onClick={() => { setSp({}); setStack([]); }}>Clear filters</button>}
        </div>
      )}
      {data && data.data.length > 0 && (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <ContactTable contacts={data.data} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
        </div>
      )}
      {data && (
        <Pager
          canPrev={Boolean(params.cursor)}
          canNext={Boolean(data.nextCursor) && !isPlaceholderData}
          onPrev={prev}
          onNext={next}
          loading={isFetching}
        />
      )}
    </div>
  );
}
