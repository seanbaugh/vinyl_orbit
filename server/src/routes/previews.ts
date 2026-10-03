import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PreviewUnavailableError, type PreviewService } from '../previews/service.js';
import { HttpError, idParam, notFound, parse } from './common.js';

const setBody = z.union([
  z.object({ appleAlbumId: z.number().int().positive() }).strict(),
  z.object({ none: z.literal(true) }).strict(),
]);

/** Maps Apple outages to 502 so the UI can offer a retry. */
async function apple<T>(req: FastifyRequest, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PreviewUnavailableError) {
      req.log.warn(e.message);
      throw new HttpError(502, "Couldn't reach Apple Music. Try again.");
    }
    throw e;
  }
}

export function previewRoutes(app: FastifyInstance, { previews }: { previews: PreviewService }) {
  app.get('/api/releases/:id/previews', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return (await apple(req, () => previews.get(id))) ?? notFound(reply);
  });

  app.get('/api/releases/:id/previews/candidates', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return (await apple(req, () => previews.candidates(id))) ?? notFound(reply);
  });

  app.put('/api/releases/:id/previews', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    const body = parse(setBody, req.body);
    const result = await apple(req, () => ('none' in body ? previews.setNone(id) : previews.setAlbum(id, body.appleAlbumId)));
    return result ?? notFound(reply);
  });

  app.delete('/api/releases/:id/previews', async (req, reply) => {
    const { id } = parse(idParam, req.params);
    return (await apple(req, () => previews.reset(id))) ?? notFound(reply);
  });
}
