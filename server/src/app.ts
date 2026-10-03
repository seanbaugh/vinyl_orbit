import fastifyStatic from '@fastify/static';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Db } from './db/index.js';
import type { PreviewService } from './previews/service.js';
import { HttpError } from './routes/common.js';
import { insightRoutes } from './routes/insights.js';
import { previewRoutes } from './routes/previews.js';
import { releaseRoutes } from './routes/releases.js';
import { syncRoutes } from './routes/sync.js';
import { userRoutes } from './routes/user.js';
import type { Scheduler } from './sync/scheduler.js';

export interface AppDeps {
  db: Db;
  scheduler: Scheduler;
  previews: PreviewService;
  dataDir: string;
  webDist?: string;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : err.statusCode ?? 500;
    const intentional = err instanceof HttpError;
    if (status >= 500 && !intentional) req.log.error(err);
    reply.code(status).send({ error: intentional || status < 500 ? err.message : 'Internal error' });
  });

  app.get('/api/health', async () => ({ ok: true }));
  releaseRoutes(app, deps);
  userRoutes(app, deps);
  insightRoutes(app, deps);
  syncRoutes(app, deps);
  previewRoutes(app, deps);

  const imagesDir = resolve(deps.dataDir, 'images');
  mkdirSync(imagesDir, { recursive: true });
  app.register(fastifyStatic, {
    root: imagesDir, prefix: '/images/', decorateReply: false, maxAge: '30d', immutable: true,
  });

  const webDist = deps.webDist && existsSync(join(deps.webDist, 'index.html')) ? deps.webDist : null;
  if (webDist) app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0];
    if (webDist && req.method === 'GET' && !url.startsWith('/api/') && !url.startsWith('/images/')) {
      return reply.type('text/html').sendFile('index.html', webDist);
    }
    return reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
