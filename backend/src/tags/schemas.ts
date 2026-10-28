import { z } from 'zod';

const name = z.string().trim().min(1, 'Tag name is required').max(50, 'Too long (max 50)');
const id = z.number().int().positive().safe();

export const addTagBody = z.object({ name });

export const bulkTagBody = z.object({
  contactIds: z
    .array(id)
    .min(1, 'Select at least one contact')
    .max(1000, 'Too many contacts (max 1000)')
    .refine((a) => new Set(a).size === a.length, 'Contact ids must be unique'),
  name,
});

export const tagIdParam = z.coerce.number().int().positive().safe();

export const companiesQuery = z.object({ q: z.string().trim().max(100).default('') });
