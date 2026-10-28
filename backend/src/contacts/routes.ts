import { Router } from 'express';
import { activitiesQuery, idParam, listQuery, patchBody } from './schemas.js';
import * as service from './service.js';

export const contactsRouter = Router();

contactsRouter.get('/', async (req, res) => {
  res.json(await service.list(listQuery.parse(req.query)));
});

contactsRouter.get('/:id', async (req, res) => {
  res.json(await service.get(idParam.parse(req.params.id)));
});

contactsRouter.patch('/:id', async (req, res) => {
  res.json(await service.update(idParam.parse(req.params.id), patchBody.parse(req.body)));
});

contactsRouter.get('/:id/activities', async (req, res) => {
  const { limit } = activitiesQuery.parse(req.query);
  res.json(await service.listActivities(idParam.parse(req.params.id), limit));
});
