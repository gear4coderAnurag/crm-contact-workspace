export type Tag = { id: number; name: string };
export type Contact = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  tags: Tag[];
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type Activity = {
  id: number;
  contactId: number;
  type: 'CONTACT_UPDATED' | 'TAG_ADDED' | 'TAG_REMOVED';
  data: { changed?: Record<string, { from: unknown; to: unknown }>; tag?: string };
  createdAt: string;
};
export type ContactPage = { data: Contact[]; nextCursor: string | null };
export type ListParams = {
  q?: string;
  company?: string;
  tagId?: string;
  sort: 'created_at' | 'name';
  order: 'asc' | 'desc';
  cursor?: string;
};
export type PatchInput = {
  version: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
};
