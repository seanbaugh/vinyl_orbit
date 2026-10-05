import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDashboard, getStats, search } from '../repo/insights.js';
import { getSpinOptions, pickSpin } from '../repo/spin.js';
import { parse, type RouteDeps } from './common.js';

/** A query param that may be repeated (genre names contain commas, so a list is sent as repeated params). */
const many = z.union([z.string().max(100), z.array(z.string().max(100)).max(50)])
  .transform((v) => (Array.isArray(v) ? v : [v])).optional();

export function insightRoutes(app: FastifyInstance, { db }: RouteDeps) {
  app.get('/api/dashboard', async () => getDashboard(db, new Date()));
  app.get('/api/stats', async () => getStats(db));
  app.get('/api/search', async (req) => {
    const { q } = parse(z.object({ q: z.string().max(200).default('') }), req.query);
    return search(db, q);
  });
  app.get('/api/spin-options', async () => getSpinOptions(db));
  app.get('/api/spin-pick', async (req) => {
    const q = parse(z.object({
      genre: many,
      style: many,
      format: z.string().max(100).optional(),
      days: z.coerce.number().int().min(0).max(36500).optional(),
      neverPlayed: z.enum(['true', '1']).optional(),
      exclude: z.string().regex(/^\d+(,\d+)*$/).max(20_000).optional(),
    }), req.query);
    return { release: pickSpin(db, {
      genres: q.genre, styles: q.style, format: q.format, days: q.days, neverPlayed: q.neverPlayed !== undefined,
      exclude: q.exclude?.split(',').map(Number),
    }) };
  });
}
