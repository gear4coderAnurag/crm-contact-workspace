import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '../src/api/types';
import { BulkTagBar } from '../src/components/BulkTagBar';
import { ContactForm } from '../src/components/ContactForm';
import { SearchInput } from '../src/components/SearchInput';
import { ToastProvider } from '../src/components/Toast';

const contact: Contact = {
  id: 42, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', phone: '+919876543210',
  company: 'Acme', tags: [], version: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

// one canned API response per test
function mockApi(status: number, body: unknown) {
  const fetch = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ContactForm', () => {
  it('stale save -> conflict banner, changed field highlighted, Save disabled, Reload latest applies their version', async () => {
    const theirs = { ...contact, phone: '+911111111111', version: 2 };
    const fetch = mockApi(409, { error: { code: 'VERSION_CONFLICT', message: 'Contact was modified by someone else', details: { current: theirs } } });
    wrap(<ContactForm contact={contact} />);

    fireEvent.change(input('Company'), { target: { value: 'Globex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/They saved version 2/)).toBeTruthy();
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ version: 1, company: 'Globex' });
    expect(screen.getByText('Now: +911111111111')).toBeTruthy();
    expect(input('Phone').closest('.field')?.classList.contains('changed')).toBe(true);
    expect(input('Company').closest('.field')?.classList.contains('changed')).toBe(false);
    expect(input('Company').value).toBe('Globex'); // user's edit is not lost
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Reload latest' }));
    expect(input('Phone').value).toBe('+911111111111');
    expect(screen.queryByText(/They saved version/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('marks a field both users changed', async () => {
    mockApi(409, { error: { code: 'VERSION_CONFLICT', message: 'x', details: { current: { ...contact, company: 'Initech', version: 2 } } } });
    wrap(<ContactForm contact={contact} />);
    fireEvent.change(input('Company'), { target: { value: 'Globex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Both changed/)).toBeTruthy();
    expect(screen.getByText('Now: Initech')).toBeTruthy();
  });

  it('400 field errors appear next to the right input', async () => {
    mockApi(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { fields: { email: 'Invalid email' } } } });
    wrap(<ContactForm contact={contact} />);
    fireEvent.change(input('Email'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Invalid email')).toBeTruthy();
    expect(input('Email').getAttribute('aria-invalid')).toBe('true');
    expect(input('Phone').getAttribute('aria-invalid')).toBe('false');
    expect(screen.queryByText(/They saved version/)).toBeNull();
  });

  it('successful save shows a toast', async () => {
    mockApi(200, { ...contact, company: 'Globex', version: 2 });
    wrap(<ContactForm contact={contact} />);
    fireEvent.change(input('Company'), { target: { value: 'Globex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved (version 2)')).toBeTruthy();
  });

  it('backend failure shows a banner', async () => {
    mockApi(500, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
    wrap(<ContactForm contact={contact} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Something went wrong');
  });
});

describe('SearchInput', () => {
  it('waits 300 ms before searching and never sends 1 character', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    const box = screen.getByLabelText(/Search/);

    fireEvent.change(box, { target: { value: 'a' } });
    expect(screen.getByText('Enter at least 2 characters')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1000));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: 'ad' } });
    fireEvent.change(box, { target: { value: 'ada' } });
    act(() => vi.advanceTimersByTime(299));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('ada');
  });
});

describe('BulkTagBar', () => {
  it('hidden with no selection', () => {
    wrap(<BulkTagBar selectedIds={[]} onDone={() => {}} />);
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('tags the selection, toasts added/skipped, clears selection', async () => {
    const fetch = mockApi(200, { tag: { id: 3, name: 'VIP' }, added: 2, skipped: 1 });
    const onDone = vi.fn();
    wrap(<BulkTagBar selectedIds={[1, 2, 3]} onDone={onDone} />);
    expect(screen.getByText('3 selected')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: ' VIP ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag to selected' }));

    expect(await screen.findByText('Tag "VIP" added to 2 contacts (1 already had it)')).toBeTruthy();
    expect(onDone).toHaveBeenCalled();
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ contactIds: [1, 2, 3], name: 'VIP' });
  });

  it('shows the API error and keeps the selection', async () => {
    mockApi(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: {} } });
    const onDone = vi.fn();
    wrap(<BulkTagBar selectedIds={[1]} onDone={onDone} />);
    fireEvent.change(screen.getByLabelText('Tag name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add tag to selected' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Invalid input');
    expect(onDone).not.toHaveBeenCalled();
  });
});
