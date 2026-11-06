/** Compose the HTTP boundary independently of process startup. */
import express from 'express';
import cors from 'cors';
import type { ErrorRequestHandler } from 'express';
import type { Config } from './config';
import { healthRouter } from './features/health/routes';
import type { DatabaseSync } from 'node:sqlite';
import { createReadinessRouter } from './features/readiness/routes';

/** Create an API with explicit CORS and safe, bounded error responses.
 * Args:
 *   config: Allowed browser origins; no database dependency is required.
 * Returns:
 *   An app usable by the listener or in-process HTTP tests.
 */
export function createApp(config: Pick<Config, 'CORS_ORIGINS'> & { database?: DatabaseSync }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
    preflightContinue: true
  }));
  /** Answer health preflight without opening any dependency. */
  app.options('/api/health', (_req, res) => {
    res.set('Allow', 'GET, OPTIONS').sendStatus(204);
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use('/api/health', healthRouter);
  app.use('/api/v1/readiness', createReadinessRouter(config.database));
  /** Hide unknown paths and never echo user-supplied URLs. */
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  /** Normalize parser failures and conceal internal exception details. */
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 500;
    if (status === 400) { res.status(400).json({ error: 'Invalid request' }); return; }
    if (status === 413) { res.status(413).json({ error: 'Request too large' }); return; }
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);
  return app;
}
