/** Verify shared wiring, durable metadata and failure isolation across both checks. */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase } from '../src/db/connection';
import { createApp } from '../src/app';

describe('starter integration', () => {
  it('checks health and readiness, reopens storage and verifies unchanged metadata', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'starter-integration-'));
    const url = `file:${directory}/starter.db`;
    let database = openDatabase(url);
    try {
      let app = createApp({ CORS_ORIGINS: [], database });
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok' });
      const ready = await request(app).get('/api/v1/readiness');
      expect(ready.status).toBe(200);
      expect(ready.body).toEqual({ status: 'ready', database: 'sqlite', schemaVersion: 1 });
      database.close();
      database = openDatabase(url);
      app = createApp({ CORS_ORIGINS: [], database });
      const reopened = await request(app).get('/api/v1/readiness');
      expect(reopened.status).toBe(200);
      expect(reopened.body).toEqual(ready.body);
      expect(database.prepare('SELECT id, version FROM schema_version').all()).toEqual([{ id: 1, version: 1 }]);
    } finally {
      if (database.isOpen) { database.close(); }
      rmSync(directory, { recursive: true });
    }
  });

  it('keeps liveness healthy when the shared SQLite connection is closed', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'starter-isolation-'));
    const database = openDatabase(`file:${directory}/starter.db`);
    const app = createApp({ CORS_ORIGINS: [], database });
    database.close();
    try {
      const unavailable = await request(app).get('/api/v1/readiness');
      expect(unavailable.status).toBe(503);
      expect(unavailable.body).toEqual({ error: 'Database unavailable' });
      expect(unavailable.text).not.toContain(directory);
      const health = await request(app).get('/api/health');
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok' });
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});
