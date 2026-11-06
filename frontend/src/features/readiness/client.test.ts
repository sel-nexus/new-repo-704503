/** Verify readiness validation and bounded transport failures. */
import { describe, expect, it, vi } from 'vitest';
import { checkReadiness } from './client';
const ready = { status: 'ready', database: 'sqlite', schemaVersion: 1 };

describe('readiness client', () => {
  it('validates the exact contract and omits credentials and cache', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ready)));
    expect(await checkReadiness({ baseUrl: '/' })).toEqual(ready);
    expect(transport).toHaveBeenCalledWith('/api/v1/readiness', expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store' }));
  });
  it('uses the configured API origin with trailing slashes removed', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example///');
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ready)));
    expect(await checkReadiness()).toEqual(ready);
    expect(transport.mock.calls[0][0]).toBe('https://api.example/api/v1/readiness');
  });
  it.each([204, 404, 500])('rejects HTTP %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(status === 204 ? null : 'private', { status }));
    await expect(checkReadiness()).rejects.toThrow(`HTTP ${status}`);
  });
  it('maps unavailable HTTP to a safe retryable database error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private/path.db', { status: 503 }));
    await expect(checkReadiness()).rejects.toThrow('Database unavailable. Try again.');
  });
  it.each([null, [], {}, { ...ready, status: 'ok' }, { ...ready, database: 'postgres' },
    { ...ready, schemaVersion: '1' }, { ...ready, schemaVersion: 2 }, { status: 'ready', database: 'sqlite' },
    { ...ready, extra: true }])('rejects malformed payload %j', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(checkReadiness()).rejects.toThrow('invalid readiness response');
  });
  it.each([
    ['status', { database: 'sqlite', schemaVersion: 1 }],
    ['database', { status: 'ready', schemaVersion: 1 }]
  ])('rejects an isolated missing %s field with a safe error', async (_field, payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(checkReadiness()).rejects.toEqual(
      new Error('The backend returned an invalid readiness response. Try again.')
    );
  });
  it('conceals invalid JSON contents', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>private</html>'));
    await expect(checkReadiness()).rejects.toThrow('invalid readiness response');
  });
  it.each([new TypeError('private'), new Error('private'), 'private'])('conceals network rejection %s', async (error) => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(error);
    await expect(checkReadiness()).rejects.toThrow('Could not reach the backend');
  });
  it.each([false, true])('times out while waiting for response body: %s', async (body) => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const stalled = new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
      if (!body) { return stalled; }
      const response = new Response();
      vi.spyOn(response, 'json').mockImplementation(() => stalled);
      return Promise.resolve(response);
    });
    const assertion = expect(checkReadiness({ timeoutMs: 50 })).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid timeout %s before network access', async (timeoutMs) => {
    const transport = vi.spyOn(globalThis, 'fetch');
    await expect(checkReadiness({ timeoutMs })).rejects.toThrow('deadline is not configured');
    expect(transport).not.toHaveBeenCalled();
  });
  it('clears the deadline on success', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(ready)));
    await checkReadiness();
    expect(vi.getTimerCount()).toBe(0);
  });
});
