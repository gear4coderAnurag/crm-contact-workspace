import type { ErrorRequestHandler, RequestHandler } from 'express';
import pg from 'pg';
import { ZodError } from 'zod';

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'EMAIL_TAKEN' | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const validationError = (fields: Record<string, string>) =>
  new AppError('VALIDATION_ERROR', 400, 'Invalid input', { fields });

export const notFound = (what: string) => new AppError('NOT_FOUND', 404, `${what} not found`);

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound('Route'));

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
    return validationError(fields);
  }
  if (err instanceof pg.DatabaseError && err.code === '23505' && err.constraint === 'contacts_email_key') {
    return new AppError('EMAIL_TAKEN', 409, 'Email already in use', {
      fields: { email: 'Already used by another contact' },
    });
  }
  // body-parser failures (malformed JSON, too large) carry a 4xx status
  if (typeof err === 'object' && err !== null && 'type' in err && String(err.type).startsWith('entity.')) {
    return validationError({ _: 'Malformed request body' });
  }
  console.error(err);
  return new AppError('INTERNAL', 500, 'Internal server error');
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs the 4-arg signature
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const e = toAppError(err);
  res.status(e.status).json({ error: { code: e.code, message: e.message, details: e.details } });
};
