/** Validate the readiness contract across the untrusted HTTP boundary. */
export interface ReadinessResponse { status: 'ready'; database: 'sqlite'; schemaVersion: 1 }
export interface ReadinessOptions { baseUrl?: string; timeoutMs?: number }

/** Request SQLite readiness with a deadline covering headers and response body.
 * Args:
 *   options: API prefix and deadline overrides; defaults reuse existing env settings.
 * Returns:
 *   Exact validated readiness metadata, never a locally fabricated success.
 * Raises:
 *   Error: Safe actionable HTTP, timeout, network or validation failure.
 */
export async function checkReadiness(options: ReadinessOptions = {}): Promise<ReadinessResponse> {
  const baseUrl = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? '';
  const timeoutMs = options.timeoutMs ?? Number(import.meta.env.VITE_HEALTH_TIMEOUT_MS ?? 5000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) { throw new Error('The check deadline is not configured correctly.'); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let failure = 'Could not reach the backend. Check your connection and try again.';
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/readiness`, {
      method: 'GET', headers: { Accept: 'application/json' },
      signal: controller.signal, cache: 'no-store', credentials: 'omit'
    });
    failure = response.status === 503 ? 'Database unavailable. Try again.' : `The backend returned HTTP ${response.status}. Try again.`;
    if (response.status !== 200) { throw new Error(failure); }
    failure = 'The backend returned an invalid readiness response. Try again.';
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)
      || !('status' in payload) || payload.status !== 'ready'
      || !('database' in payload) || payload.database !== 'sqlite'
      || !('schemaVersion' in payload) || payload.schemaVersion !== 1
      || Object.keys(payload).length !== 3) {
      throw new Error(failure);
    }
    return { status: payload.status, database: payload.database, schemaVersion: payload.schemaVersion };
  } catch {
    if (controller.signal.aborted) { throw new Error('The backend took too long to respond. Try again.'); }
    throw new Error(failure);
  } finally {
    clearTimeout(timer);
  }
}
