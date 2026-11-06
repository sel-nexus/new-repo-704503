/** Validate backend liveness across the untrusted network boundary. */
export interface HealthResponse { status: 'ok' }

export interface HealthOptions { baseUrl?: string; timeoutMs?: number }

/** Request the exact health contract within a bounded deadline.
 * Args:
 *   options: Optional origin/prefix and deadline overrides.
 * Returns:
 *   The validated dependency-free health result.
 * Raises:
 *   Error: A safe actionable timeout, HTTP, network or response error.
 */
export async function checkHealth(options: HealthOptions = {}): Promise<HealthResponse> {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '';
  const timeoutMs = options.timeoutMs ?? Number(import.meta.env.VITE_HEALTH_TIMEOUT_MS ?? 5000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) { throw new Error('The check deadline is not configured correctly.'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
      method: 'GET', headers: { Accept: 'application/json' },
      signal: controller.signal, cache: 'no-store', credentials: 'omit'
    });
    if (response.status !== 200) { throw new Error(`The backend returned HTTP ${response.status}. Try again.`); }
    let payload: unknown;
    try { payload = await response.json(); }
    catch { throw new Error('The backend returned an invalid health response. Try again.'); }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)
      || !('status' in payload) || payload.status !== 'ok' || Object.keys(payload).length !== 1) {
      throw new Error('The backend returned an invalid health response. Try again.');
    }
    return { status: 'ok' };
  } catch (error) {
    if (controller.signal.aborted) { throw new Error('The backend took too long to respond. Try again.'); }
    if (error instanceof TypeError) { throw new Error('Could not reach the backend. Check your connection and try again.'); }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
