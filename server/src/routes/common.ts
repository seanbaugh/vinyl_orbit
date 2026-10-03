import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import type { Scheduler } from '../sync/scheduler.js';

export interface RouteDeps {
  db: Db;
  scheduler: Scheduler;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export class HttpError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new HttpError(400, `${issue.path.join('.') || 'input'}: ${issue.message}`);
  }
  return r.data;
}

export const notFound = (reply: FastifyReply) => reply.code(404).send({ error: 'Not found' });
