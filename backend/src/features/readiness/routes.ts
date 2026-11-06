/** Expose readiness with safe errors and explicit method boundaries. */
import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { checkReadiness } from './service';

/** Bind readiness to the one connection provided by startup.
 * Args:
 *   database: Optional connection so liveness-only app instances stay valid.
 * Returns:
 *   A router that never opens a database itself.
 */
export function createReadinessRouter(database?: DatabaseSync): Router {
  const router = Router();
  /** Answer only the exact resource and conceal database exceptions. */
  const handler: RequestHandler = (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.set('Allow', 'GET, OPTIONS').status(204).end();
      return;
    }
    if (req.method !== 'GET') {
      res.set('Allow', 'GET, OPTIONS').status(405).json({ error: 'Method not allowed' });
      return;
    }
    try {
      res.status(200).json(checkReadiness(database));
    } catch {
      res.status(503).json({ error: 'Database unavailable' });
    }
  };
  router.all('/', handler);
  return router;
}
