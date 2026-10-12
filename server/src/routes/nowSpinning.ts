import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { clearNowSpinning, getNowSpinning, logPlayIfNew, setNowSpinning } from '../repo/nowSpinning.js';
import { HttpError, parse, type RouteDeps } from './common.js';

export function nowSpinningRoutes(app: FastifyInstance, { db }: RouteDeps) {
  app.get('/api/now-spinning', async () => getNowSpinning(db, new Date()));

  // The Spin now button: mark the record as spinning and log the play (once per 10 minutes).
  app.put('/api/now-spinning', async (req) => {
    const { releaseId } = parse(z.object({ releaseId: z.number().int().positive() }), req.body);
    if (!db.prepare('SELECT 1 FROM releases WHERE id = ? AND removed_at IS NULL').get(releaseId)) {
      throw new HttpError(404, 'Not found');
    }
    const now = new Date();
    setNowSpinning(db, releaseId, 'manual', now);
    const play = logPlayIfNew(db, releaseId, now);
    return { ...getNowSpinning(db, now), playLogged: play !== null };
  });

  app.delete('/api/now-spinning', async (_req, reply) => {
    clearNowSpinning(db);
    return reply.code(204).send();
  });
}
