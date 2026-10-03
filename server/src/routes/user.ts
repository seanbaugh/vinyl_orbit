import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getReleaseDetail } from '../repo/releases.js';
import {
  addPlay, addTagToRelease, addToCrate, createCrate, createTag, deleteCrate, deletePlay, deleteTag, getCrate,
  listCrates, listTags, removeFromCrate, removeTagFromRelease, saveNote, updateCrate, updateTag,
} from '../repo/user.js';
import { HttpError, idParam, notFound, parse, type RouteDeps } from './common.js';

const name = z.string().trim().min(1).max(100);
const releaseExists = (db: RouteDeps['db'], id: number) => {
  if (!db.prepare('SELECT 1 FROM releases WHERE id = ?').get(id)) throw new HttpError(404, 'Not found');
};

export function userRoutes(app: FastifyInstance, { db }: RouteDeps) {
  // notes
  app.put('/api/releases/:id/note', async (req) => {
    const { id } = parse(idParam, req.params);
    const { bodyMd } = parse(z.object({ bodyMd: z.string().max(100_000) }), req.body);
    releaseExists(db, id);
    saveNote(db, id, bodyMd, new Date().toISOString());
    return getReleaseDetail(db, id)!.note ?? { bodyMd: '', updatedAt: null };
  });

  // tags
  app.get('/api/tags', async () => listTags(db));
  app.post('/api/tags', async (req, reply) => {
    const body = parse(z.object({ name, color: z.string().nullable().optional() }), req.body);
    return reply.code(201).send(createTag(db, body.name, body.color ?? null));
  });
  app.patch('/api/tags/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name: name.optional(), color: z.string().nullable().optional() }), req.body);
    return updateTag(db, id, body) ?? notFound(reply);
  });
  app.delete('/api/tags/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return deleteTag(db, id) ? reply.code(204).send() : notFound(reply);
  });
  app.post('/api/releases/:id/tags', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name }), req.body);
    releaseExists(db, id);
    return reply.code(201).send(addTagToRelease(db, id, body.name));
  });
  app.delete('/api/releases/:id/tags/:tagId', async (req, reply) => {
    const p = parse(idParam.extend({ tagId: z.coerce.number().int().positive() }), req.params);
    removeTagFromRelease(db, p.id, p.tagId);
    return reply.code(204).send();
  });

  // crates
  app.get('/api/crates', async () => listCrates(db));
  app.post('/api/crates', async (req, reply) => {
    const body = parse(z.object({ name, description: z.string().max(2000).default('') }), req.body);
    return reply.code(201).send(createCrate(db, body.name, body.description, new Date().toISOString()));
  });
  app.get('/api/crates/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return getCrate(db, id) ?? notFound(reply);
  });
  app.patch('/api/crates/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({ name: name.optional(), description: z.string().max(2000).optional() }), req.body);
    return updateCrate(db, id, body) ?? notFound(reply);
  });
  app.delete('/api/crates/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return deleteCrate(db, id) ? reply.code(204).send() : notFound(reply);
  });
  app.post('/api/crates/:id/releases', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const { releaseId } = parse(z.object({ releaseId: z.number().int().positive() }), req.body);
    if (!getCrate(db, id)) return notFound(reply);
    releaseExists(db, releaseId);
    addToCrate(db, id, releaseId);
    return reply.code(201).send(getCrate(db, id));
  });
  app.delete('/api/crates/:id/releases/:releaseId', async (req, reply) => {
    const p = parse(idParam.extend({ releaseId: z.coerce.number().int().positive() }), req.params);
    removeFromCrate(db, p.id, p.releaseId);
    return reply.code(204).send();
  });

  // plays
  app.post('/api/releases/:id/plays', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(z.object({
      playedAt: z.string().datetime({ offset: true }).optional(),
      note: z.string().max(1000).nullable().optional(),
    }), req.body);
    releaseExists(db, id);
    const playedAt = (body.playedAt ? new Date(body.playedAt) : new Date()).toISOString(); // store UTC so string comparisons hold
    return reply.code(201).send(addPlay(db, id, playedAt, body.note ?? null));
  });
  app.delete('/api/plays/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return deletePlay(db, id) ? reply.code(204).send() : notFound(reply);
  });
}
