import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadAllOverrides, matchRecord } from '../homeassistant/match.js';
import { HttpError, notFound, parse, type RouteDeps } from './common.js';

const query = z.object({ album: z.string().trim().min(1), artist: z.string().trim().min(1) });

/**
 * The cover for the album and artist text Home Assistant holds for a tag. Read-only: it finds the record the same
 * way the now-spinning poller does and serves the cover already cached from Discogs.
 */
export function coverRoutes(app: FastifyInstance, { db, dataDir }: RouteDeps & { dataDir: string }) {
  const overridesFile = join(dataDir, 'ha-overrides.json');
  const imagesDir = resolve(dataDir, 'images');

  app.get('/api/cover', async (req, reply) => {
    const { album, artist } = parse(query, req.query);
    const releaseId = matchRecord(db, { album, artist }, loadAllOverrides(overridesFile));
    if (releaseId === null) throw new HttpError(404, 'No matching record');

    const row = db.prepare('SELECT local_path FROM images WHERE release_id = ? AND idx = 0').get(releaseId) as
      { local_path: string | null } | undefined;
    const file = row?.local_path ? resolve(imagesDir, row.local_path) : null;
    if (!file || !file.startsWith(imagesDir + '/')) return notFound(reply);
    try {
      const bytes = await readFile(file);
      return reply.type('image/jpeg').header('cache-control', 'no-cache').send(bytes);
    } catch {
      return notFound(reply);
    }
  });
}
