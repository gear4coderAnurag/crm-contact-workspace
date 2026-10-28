import { z } from 'zod';
import { validationError } from '../errors.js';

export const cursorSchema = z.object({
  s: z.enum(['created_at', 'name']),
  o: z.enum(['asc', 'desc']),
  v: z.string(),
  id: z.number().int(),
});
export type Cursor = z.infer<typeof cursorSchema>;

export const encodeCursor = (c: Cursor): string => Buffer.from(JSON.stringify(c)).toString('base64url');

export function decodeCursor(raw: string, sort: Cursor['s'], order: Cursor['o']): Cursor {
  const bad = () => validationError({ cursor: 'Invalid cursor' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw bad();
  }
  const c = cursorSchema.safeParse(parsed);
  if (!c.success || c.data.s !== sort || c.data.o !== order) throw bad();
  return c.data;
}
