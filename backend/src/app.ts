import express from 'express';
import { contactsRouter } from './contacts/routes.js';
import { tagsRouter } from './tags/routes.js';
import { errorHandler, notFoundHandler } from './errors.js';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', tagsRouter);
  app.use('/api/contacts', contactsRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
