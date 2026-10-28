import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/lib/cursor.js';

describe('cursor', () => {
  const c = { s: 'created_at', o: 'desc', v: '2024-01-01 10:00:00.123456+00', id: 7 } as const;

  it('round-trips and keeps microsecond text', () => {
    expect(decodeCursor(encodeCursor(c), 'created_at', 'desc')).toEqual(c);
  });

  it('rejects garbage, wrong shape, and mismatched sort/order', () => {
    expect(() => decodeCursor('%%%', 'created_at', 'desc')).toThrow();
    expect(() => decodeCursor(Buffer.from('{"a":1}').toString('base64url'), 'created_at', 'desc')).toThrow();
    expect(() => decodeCursor(encodeCursor(c), 'name', 'desc')).toThrow();
    expect(() => decodeCursor(encodeCursor(c), 'created_at', 'asc')).toThrow();
  });
});
