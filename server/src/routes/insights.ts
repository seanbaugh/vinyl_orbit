import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDashboard, getStats, search } from '../repo/insights.js';
import { getSpinOptions, pickSpin } from '../repo/spin.js';
import { parse, type RouteDeps } from './common.js';

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
      genre: z.string().max(100).optional(),
      style: z.string().max(100).optional(),
      format: z.string().max(100).optional(),
      days: z.coerce.number().int().min(0).max(36500).optional(),
      neverPlayed: z.enum(['true', '1']).optional(),
      exclude: z.string().regex(/^\d+(,\d+)*$/).max(20_000).optional(),
    }), req.query);
    return { release: pickSpin(db, {
      genre: q.genre, style: q.style, format: q.format, days: q.days, neverPlayed: q.neverPlayed !== undefined,
      exclude: q.exclude?.split(',').map(Number),
    }) };
  });
}
