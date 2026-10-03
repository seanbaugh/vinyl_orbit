import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getFacets, getReleaseDetail, listReleases } from '../repo/releases.js';
import { idParam, notFound, parse, type RouteDeps } from './common.js';

const optNum = z.coerce.number().int().optional();

const releaseQuery = z.object({
  q: z.string().optional(),
  genre: z.string().optional(),
  style: z.string().optional(),
  format: z.string().optional(),
  label: z.string().optional(),
  artist: z.string().optional(),
  decade: optNum,
  tag: optNum,
  crate: optNum,
  sort: z.enum(['artist', 'title', 'year', 'added', 'played', 'plays', 'value']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  includeRemoved: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export function releaseRoutes(app: FastifyInstance, { db }: RouteDeps) {
  app.get('/api/releases', async (req) => listReleases(db, parse(releaseQuery, req.query)));

  app.get('/api/releases/:id', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return getReleaseDetail(db, id) ?? notFound(reply);
  });

  app.get('/api/facets', async () => getFacets(db));
}
