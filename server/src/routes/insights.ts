import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDashboard, getStats, search } from '../repo/insights.js';
import { parse, type RouteDeps } from './common.js';

export function insightRoutes(app: FastifyInstance, { db }: RouteDeps) {
  app.get('/api/dashboard', async () => getDashboard(db, new Date()));
  app.get('/api/stats', async () => getStats(db));
  app.get('/api/search', async (req) => {
    const { q } = parse(z.object({ q: z.string().max(200).default('') }), req.query);
    return search(db, q);
  });
}
