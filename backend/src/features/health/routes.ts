/** Serve dependency-free process liveness at the deploy probe path. */
import { Router } from 'express';

export const healthRouter = Router();

/** Reject unsupported methods, including Express's implicit HEAD handling. */
healthRouter.all('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.set('Allow', 'GET, OPTIONS');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  res.status(200).json({ status: 'ok' });
});
