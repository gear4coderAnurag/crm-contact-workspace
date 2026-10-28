import { z } from 'zod';

const emptyToNull = (s: string) => (s === '' ? null : s);

export const idParam = z.coerce.number().int().positive().safe();

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Too long')
  .transform(emptyToNull)
  .pipe(z.string().email('Invalid email').nullable());

const phone = z
  .string()
  .transform((s) => s.replace(/[\s\-().]/g, ''))
  .transform(emptyToNull)
  .pipe(z.string().regex(/^\+?[0-9]{7,15}$/, 'Invalid phone number').nullable());

const company = z.string().trim().max(200, 'Too long').transform(emptyToNull);

const name = (label: string) => z.string().trim().min(1, `${label} is required`).max(100, 'Too long');

export const patchBody = z
  .object({
    version: z.number().int().positive(),
    firstName: name('First name').optional(),
    lastName: name('Last name').optional(),
    email: email.nullable().optional(),
    phone: phone.nullable().optional(),
    company: company.nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), { message: 'Nothing to update', path: ['_'] });
export type PatchBody = z.infer<typeof patchBody>;

export const listQuery = z.object({
  q: z.string().trim().min(2, 'Enter at least 2 characters').max(100, 'Too long').optional(),
  company: z.string().min(1).optional(),
  tagId: z.coerce.number().int().positive().safe().optional(),
  sort: z.enum(['created_at', 'name']).default('created_at'),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const activitiesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
