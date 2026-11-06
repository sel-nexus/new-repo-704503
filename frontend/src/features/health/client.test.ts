/** Verify health response validation and transport deadlines independently of UI. */
import { describe, it, expect, vi } from 'vitest';
import { checkHealth } from './client';

describe('checkHealth', () => {
  it('validates status ok and uses the same-origin endpoint without credentials', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}', { status: 200 }));
    expect(await checkHealth({ baseUrl: '/' })).toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store' }));
  });
  it('reads an environment-provided API origin and removes trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example///');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}'));
    expect(await checkHealth()).toEqual({ status: 'ok' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/api/health');
  });
  it.each([204, 404, 503])('rejects HTTP %s rather than reporting success', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(status === 204 ? null : '{"status":"ok"}', { status }));
    await expect(checkHealth()).rejects.toThrow(`HTTP ${status}`);
  });
  it.each([null, [], {}, { status: 'down' }, { status: true }, { status: 'ok', extra: 1 }])('rejects malformed contract %j', async (payload) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(checkHealth()).rejects.toThrow('invalid health response');
  });
  it('rejects invalid JSON without exposing its contents', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>internal error</html>'));
    await expect(checkHealth()).rejects.toThrow('invalid health response');
  });
  it('maps a network failure to an actionable error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('private transport details'));
    await expect(checkHealth()).rejects.toThrow('Could not reach the backend. Check your connection and try again.');
  });
  it('aborts a stalled network request at the configured deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const assertion = expect(checkHealth({ timeoutMs: 50 })).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the deadline active while the response body is still arriving', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const response = new Response();
      vi.spyOn(response, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      return response;
    });
    const assertion = expect(checkHealth({ timeoutMs: 50 })).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid timeout %s before fetching', async (timeoutMs) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(checkHealth({ timeoutMs })).rejects.toThrow('deadline is not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('clears the deadline after success', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}'));
    await checkHealth();
    expect(vi.getTimerCount()).toBe(0);
  });
});
