import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse, type RouteDeps } from './common.js';

export function syncRoutes(app: FastifyInstance, { scheduler }: RouteDeps) {
  app.get('/api/sync/status', async () => scheduler.status());
  app.post('/api/sync', async (req) => {
    const { full } = parse(z.object({ full: z.boolean().default(true) }), req.body);
    return scheduler.trigger(full);
  });
}
