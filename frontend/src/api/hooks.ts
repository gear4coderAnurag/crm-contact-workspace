import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './client';
import type { Activity, Contact, ContactPage, ListParams, PatchInput, Tag } from './types';

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const useContacts = (params: ListParams) =>
  useQuery({
    queryKey: ['contacts', params],
    queryFn: () => request<ContactPage>('GET', `/contacts${qs({ ...params, limit: 20 })}`),
    placeholderData: keepPreviousData,
  });

export const useContact = (id: number) =>
  useQuery({ queryKey: ['contact', id], queryFn: () => request<Contact>('GET', `/contacts/${id}`) });

export const useActivities = (id: number) =>
  useQuery({
    queryKey: ['activities', id],
    queryFn: () => request<{ data: Activity[] }>('GET', `/contacts/${id}/activities?limit=20`),
  });

export const useTags = () =>
  useQuery({ queryKey: ['tags'], queryFn: () => request<{ data: Tag[] }>('GET', '/tags') });

export const useCompanies = (q: string) =>
  useQuery({
    queryKey: ['companies', q],
    queryFn: () => request<{ data: string[] }>('GET', `/companies${qs({ q })}`),
    placeholderData: keepPreviousData,
  });

function useInvalidate(contactId?: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['contacts'] });
    void qc.invalidateQueries({ queryKey: ['tags'] });
    if (contactId !== undefined) {
      void qc.invalidateQueries({ queryKey: ['contact', contactId] });
      void qc.invalidateQueries({ queryKey: ['activities', contactId] });
    }
  };
}

export function useUpdateContact(id: number) {
  const invalidate = useInvalidate(id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchInput) => request<Contact>('PATCH', `/contacts/${id}`, input),
    onSuccess: (c) => {
      qc.setQueryData(['contact', id], c);
      invalidate();
    },
  });
}

export function useAddTag(id: number) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (name: string) => request<Tag>('POST', `/contacts/${id}/tags`, { name }),
    onSuccess: invalidate,
  });
}

export function useRemoveTag(id: number) {
  const invalidate = useInvalidate(id);
  return useMutation({
    mutationFn: (tagId: number) => request<void>('DELETE', `/contacts/${id}/tags/${tagId}`),
    onSuccess: invalidate,
  });
}

export function useBulkTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { contactIds: number[]; name: string }) =>
      request<{ tag: Tag; added: number; skipped: number }>('POST', '/contacts/bulk/tags', v),
    onSuccess: invalidate,
  });
}
