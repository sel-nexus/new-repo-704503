/** Exercise the actual HTTP boundary, including method and CORS failures. */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { errorHandler } from '../src/middleware/errorHandler';

const allowedOrigin = 'http://localhost:5173';
const app = createApp({ CORS_ORIGINS: [allowedOrigin] });

describe('health HTTP contract', () => {
  it('returns exact dependency-free liveness with no cache or server disclosure', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)('rejects %s with 405 and explicit Allow', async (method) => {
    const response = await request(app)[method]('/api/health');
    expect(response.status).toBe(405);
    expect(response.body).toEqual({ error: 'Method not allowed' });
    expect(response.headers.allow).toBe('GET, OPTIONS');
  });

  it('does not implicitly accept HEAD', async () => {
    const response = await request(app).head('/api/health');
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, OPTIONS');
    expect(response.text).toBeUndefined();
  });

  it.each(['/api/missing', '/api/health/missing', '/api/%3Cscript%3E', '/api/v1/missing'])('safely rejects unknown path %s', async (url) => {
    const response = await request(app).get(url);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
    expect(response.text).not.toContain(url);
  });

  it('allows only the configured browser origin without credentials', async () => {
    const response = await request(app).get('/api/health').set('Origin', allowedOrigin);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('does not grant CORS access to an untrusted origin', async () => {
    const response = await request(app).get('/api/health').set('Origin', 'https://untrusted.example');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('supports an allowed health preflight', async () => {
    const response = await request(app).options('/api/health')
      .set('Origin', allowedOrigin).set('Access-Control-Request-Method', 'GET');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-methods']).toBe('GET,OPTIONS');
  });

  it('does not allow an untrusted preflight or turn unknown OPTIONS into success', async () => {
    const denied = await request(app).options('/api/health').set('Origin', 'https://untrusted.example');
    expect(denied.status).toBe(204);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    const unknown = await request(app).options('/api/unknown');
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'Not found' });
  });

  it('works with cross-origin access disabled and no database configuration', async () => {
    const response = await request(createApp({ CORS_ORIGINS: [] })).get('/api/health').set('Origin', allowedOrigin);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('conceals malformed JSON contents', async () => {
    const response = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{"private":');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid request' });
    expect(response.text).not.toContain('private');
  });

  it('rejects oversized request bodies with a safe 413', async () => {
    const response = await request(app).post('/api/health').send({ content: 'x'.repeat(17000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'Request too large' });
  });
});

describe('safe error middleware', () => {
  it.each([new Error('private diagnostic'), null, 'private diagnostic', {}, { status: 401 }, { status: '400' }])(
    'conceals unexpected failures with an exact generic 500: %j', async (failure) => {
      const failingApp = express();
      failingApp.get('/failure', (_req, _res, next) => next(failure ?? new Error('private diagnostic')));
      // Direct invocation exercises null, which Express treats as no error in next().
      if (failure === null) {
        failingApp.get('/null', (req, res, next) => errorHandler(null, req, res, next));
      }
      failingApp.use(errorHandler);
      const response = await request(failingApp).get(failure === null ? '/null' : '/failure');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(response.text).not.toContain('private diagnostic');
    }
  );

  it('delegates the original error without writing after headers were sent', () => {
    const error = Object.assign(new Error('private diagnostic'), { status: 400 });
    const status = vi.fn();
    const json = vi.fn();
    const next = vi.fn();
    errorHandler(error, {} as Request, { headersSent: true, status, json } as unknown as Response, next);
    expect(next).toHaveBeenCalledExactlyOnceWith(error);
    expect(status).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});

describe('startup environment contract', () => {
  it('accepts runnable development defaults and a blank production CORS list', () => {
    expect(loadConfig({}).DATABASE_URL).toBe('file:./data/starter.db');
    expect(loadConfig({ NODE_ENV: 'production', CORS_ORIGINS: '' }).CORS_ORIGINS).toEqual([]);
  });
  it.each([
    { PORT: '0' }, { PORT: '65536' }, { PORT: 'not-a-port' }, { HOST: '' },
    { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://example.com/path' },
    { DATABASE_URL: ':memory:' }, { DATABASE_URL: 'file::memory:' },
    { DATABASE_URL: 'file://remote/path.db' }, { DATABASE_URL: 'file:' }
  ])('rejects invalid startup values without echoing them: %j', (env) => {
    expect(() => loadConfig(env)).toThrow('Invalid configuration:');
  });
});
