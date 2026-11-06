/** Keep error responses bounded and free of internal diagnostics. */
import type { ErrorRequestHandler } from 'express';

/** Normalize parser failures and delegate errors after a response has started.
 * Args:
 *   error: The failure raised by a parser or request handler.
 *   res: The response to normalize only while headers remain unsent.
 *   next: Delegate an already-started response to Express's downstream handler.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : 500;
  if (status === 400) { res.status(400).json({ error: 'Invalid request' }); return; }
  if (status === 413) { res.status(413).json({ error: 'Request too large' }); return; }
  res.status(500).json({ error: 'Internal server error' });
};
