import { Router } from 'express';
import { idParam } from '../contacts/schemas.js';
import { addTagBody, bulkTagBody, companiesQuery, tagIdParam } from './schemas.js';
import * as service from './service.js';

// Mounted at /api. /contacts/bulk/tags is declared before /contacts/:id/tags.
export const tagsRouter = Router();

tagsRouter.get('/tags', async (_req, res) => {
  res.json(await service.listTags());
});

tagsRouter.get('/companies', async (req, res) => {
  res.json(await service.listCompanies(companiesQuery.parse(req.query).q));
});

tagsRouter.post('/contacts/bulk/tags', async (req, res) => {
  const { contactIds, name } = bulkTagBody.parse(req.body);
  res.json(await service.bulkAddTag(contactIds, name));
});

tagsRouter.post('/contacts/:id/tags', async (req, res) => {
  const { tag, created } = await service.addTag(idParam.parse(req.params.id), addTagBody.parse(req.body).name);
  res.status(created ? 201 : 200).json(tag);
});

tagsRouter.delete('/contacts/:id/tags/:tagId', async (req, res) => {
  await service.removeTag(idParam.parse(req.params.id), tagIdParam.parse(req.params.tagId));
  res.status(204).end();
});
