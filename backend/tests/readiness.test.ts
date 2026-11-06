/** Verify real temporary SQLite files, migrations and HTTP readiness boundaries. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { openDatabase, migrateDatabase } from '../src/db/connection';
import { checkReadiness } from '../src/features/readiness/service';
import { createApp } from '../src/app';

let directory: string;
let url: string;
let databases: DatabaseSync[];
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'starter-readiness-'));
  url = `file:${directory}/nested/starter.db`;
  databases = [];
});
afterEach(() => {
  for (const database of databases) { if (database.isOpen) { database.close(); } }
  rmSync(directory, { recursive: true, force: true });
});
/** Register real connections for reliable fixture cleanup. */
function open(): DatabaseSync {
  const database = openDatabase(url);
  databases.push(database);
  return database;
}
const ready = { status: 'ready', database: 'sqlite', schemaVersion: 1 };

describe('file-backed database readiness', () => {
  it('creates nested storage and reads actual schema metadata', () => {
    const database = open();
    expect(checkReadiness(database)).toEqual(ready);
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: 'schema_version' }]);
  });
  it('persists version across close and reopen and migrates idempotently', () => {
    const database = open();
    migrateDatabase(database);
    migrateDatabase(database);
    database.close();
    const reopened = open();
    expect(checkReadiness(reopened)).toEqual(ready);
    expect(reopened.prepare('SELECT * FROM schema_version').all()).toEqual([{ id: 1, version: 1 }]);
  });
  it.each([
    'INSERT INTO schema_version VALUES (1, 1)',
    'INSERT INTO schema_version VALUES (2, 1)',
    'UPDATE schema_version SET version = NULL',
    'UPDATE schema_version SET version = 0',
    'UPDATE schema_version SET version = 2',
    "UPDATE schema_version SET version = 'bad'"
  ])('enforces internal metadata constraint: %s', (sql) => {
    const database = open();
    expect(() => database.exec(sql)).toThrow();
    expect(checkReadiness(database)).toEqual(ready);
  });
  it('fails closed without a database and after connection closure', () => {
    expect(() => checkReadiness()).toThrow('Database unavailable');
    const database = open();
    database.close();
    expect(() => checkReadiness(database)).toThrow('Database unavailable');
  });
  it.each(['DELETE FROM schema_version', 'DROP TABLE schema_version'])('rejects absent metadata: %s', (sql) => {
    const database = open();
    database.exec(sql);
    expect(() => checkReadiness(database)).toThrow('Database unavailable');
  });
  it('rejects unsupported metadata and rolls back an unsuccessful migration', () => {
    const database = open();
    database.exec('DROP TABLE schema_version; CREATE TABLE schema_version (id INTEGER, version INTEGER); INSERT INTO schema_version VALUES (1, 2)');
    expect(() => checkReadiness(database)).toThrow('Database unavailable');
    expect(() => migrateDatabase(database)).toThrow();
    expect(database.prepare('SELECT * FROM schema_version').all()).toEqual([{ id: 1, version: 2 }]);
  });
  it.each(['', ':memory:', 'file:', 'file::memory:', 'file:%3Amemory%3A', 'file://remote/private.db', 'sqlite:private.db', 'file:private.db?mode=memory', 'file:private.db#fragment', 'file:%00.db', 'file:%XX'])('rejects invalid or memory URL without disclosure: %s', (invalid) => {
    expect(() => openDatabase(invalid)).toThrow(/^Database unavailable$/);
  });
  it('conceals filesystem and corrupt database errors', () => {
    writeFileSync(path.join(directory, 'blocker'), 'not a directory');
    expect(() => openDatabase(`file:${directory}/blocker/db`)).toThrow(/^Database unavailable$/);
    writeFileSync(path.join(directory, 'corrupt.db'), 'not SQLite');
    expect(() => openDatabase(`file:${directory}/corrupt.db`)).toThrow(/^Database unavailable$/);
  });
});

describe('readiness HTTP contract', () => {
  it('returns exact 200 JSON from a real file database without caching', async () => {
    const response = await request(createApp({ CORS_ORIGINS: [], database: open() })).get('/api/v1/readiness');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(ready);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
  it('returns safe 503 without a connection, not a memory fallback', async () => {
    const response = await request(createApp({ CORS_ORIGINS: [] })).get('/api/v1/readiness');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Database unavailable' });
  });
  it.each(['closed', 'missing table', 'missing record'])('returns safe 503 for %s', async (failure) => {
    const database = open();
    if (failure === 'closed') { database.close(); }
    if (failure === 'missing table') { database.exec('DROP TABLE schema_version'); }
    if (failure === 'missing record') { database.exec('DELETE FROM schema_version'); }
    const response = await request(createApp({ CORS_ORIGINS: [], database })).get('/api/v1/readiness');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Database unavailable' });
    expect(response.text).not.toContain(directory);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it.each(['post', 'put', 'patch', 'delete', 'head'] as const)('rejects %s explicitly', async (method) => {
    const response = await request(createApp({ CORS_ORIGINS: [], database: open() }))[method]('/api/v1/readiness');
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, OPTIONS');
    if (method !== 'head') { expect(response.body).toEqual({ error: 'Method not allowed' }); }
  });
  it('handles allowed preflight without needing a database', async () => {
    const origin = 'http://localhost:5173';
    const response = await request(createApp({ CORS_ORIGINS: [origin] })).options('/api/v1/readiness')
      .set('Origin', origin).set('Access-Control-Request-Method', 'GET');
    expect(response.status).toBe(204);
    expect(response.headers.allow).toBe('GET, OPTIONS');
    expect(response.headers['access-control-allow-origin']).toBe(origin);
  });
  it('keeps nested readiness resources unknown', async () => {
    const response = await request(createApp({ CORS_ORIGINS: [], database: open() })).get('/api/v1/readiness/private');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });
});
