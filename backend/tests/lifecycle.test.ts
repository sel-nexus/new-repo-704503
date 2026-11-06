/** Exercise lifecycle failures and drain ordering with real file-backed SQLite. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/db/connection';
import { startLifecycle } from '../src/lifecycle';

let directory: string;
let databases: DatabaseSync[];
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'starter-lifecycle-'));
  databases = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const database of databases) { if (database.isOpen) { database.close(); } }
  rmSync(directory, { recursive: true, force: true });
});

/** Isolate listener events and exit status while opening an actual SQLite file. */
function fixture() {
  const config = loadConfig({ DATABASE_URL: `file:${directory}/starter.db` });
  const process = Object.assign(new EventEmitter(), { exitCode: undefined as number | string | undefined });
  const logger = { info: vi.fn(), error: vi.fn() };
  let drained: ((error?: Error) => void) | undefined;
  const server = Object.assign(new EventEmitter(), {
    close: vi.fn((callback: (error?: Error) => void) => { drained = callback; }),
    closeAllConnections: vi.fn()
  });
  const open = vi.fn((url: string) => {
    const database = openDatabase(url);
    databases.push(database);
    return database;
  });
  const listen = vi.fn((_config: typeof config, _database: DatabaseSync, ready: () => void) => {
    ready();
    return server;
  });
  const dependencies = { loadConfig: () => config, openDatabase: open, listen, process, logger };
  return {
    config, process, logger, server, dependencies,
    database: () => databases[0],
    drain: (error?: Error) => {
      if (!drained) { throw new Error('Shutdown has not started'); }
      drained(error);
    }
  };
}

describe('startup and shutdown lifecycle', () => {
  it('opens the configured file once and announces listener readiness', () => {
    const f = fixture();
    startLifecycle(f.dependencies);
    expect(f.dependencies.openDatabase).toHaveBeenCalledExactlyOnceWith(f.config.DATABASE_URL);
    expect(f.dependencies.listen).toHaveBeenCalledWith(f.config, f.database(), expect.any(Function));
    expect(f.database().prepare('SELECT version FROM schema_version').get()).toEqual({ version: 1 });
    expect(f.logger.info).toHaveBeenCalledExactlyOnceWith(`API listening on port ${f.config.PORT}`);
    expect(f.process.exitCode).toBeUndefined();
    expect(f.process.listenerCount('SIGTERM')).toBe(1);
    expect(f.process.listenerCount('SIGINT')).toBe(1);
    expect(f.logger.error).not.toHaveBeenCalled();
  });

  it('fails configuration before opening storage or registering signals', () => {
    const f = fixture();
    f.dependencies.loadConfig = () => { throw new Error('private configuration'); };
    expect(() => startLifecycle(f.dependencies)).not.toThrow();
    expect(f.dependencies.openDatabase).not.toHaveBeenCalled();
    expect(f.dependencies.listen).not.toHaveBeenCalled();
    expect(f.process.eventNames()).toEqual([]);
    expect(f.logger.error.mock.calls).toEqual([['API startup failed']]);
    expect(f.process.exitCode).toBe(1);
  });

  it('reports real database startup failure without starting a listener', () => {
    const f = fixture();
    f.dependencies.loadConfig = () => ({ ...f.config, DATABASE_URL: 'file::memory:' });
    startLifecycle(f.dependencies);
    expect(f.dependencies.listen).not.toHaveBeenCalled();
    expect(databases).toEqual([]);
    expect(f.logger.error.mock.calls).toEqual([['API startup failed']]);
    expect(f.process.exitCode).toBe(1);
  });

  it('closes an acquired database when synchronous listener startup throws', () => {
    const f = fixture();
    f.dependencies.listen.mockImplementation(() => { throw new Error('private bind failure'); });
    startLifecycle(f.dependencies);
    expect(f.database().isOpen).toBe(false);
    expect(f.process.eventNames()).toEqual([]);
    expect(f.logger.error.mock.calls).toEqual([['API startup failed']]);
    expect(f.process.exitCode).toBe(1);
  });

  it('closes storage and sets failure status on an asynchronous listener error', () => {
    const f = fixture();
    startLifecycle(f.dependencies);
    f.server.emit('error', new Error('private listener failure'));
    expect(f.database().isOpen).toBe(false);
    expect(f.logger.error.mock.calls).toEqual([['API listener failed']]);
    expect(f.process.exitCode).toBe(1);
    // A second listener error must not close an already-closed connection.
    const close = vi.spyOn(f.database(), 'close');
    f.server.emit('error', new Error('second failure'));
    expect(close).not.toHaveBeenCalled();
  });

  it.each(['SIGTERM', 'SIGINT'])('drains active work on %s before closing storage and cancels the deadline', (signal) => {
    const f = fixture();
    startLifecycle(f.dependencies);
    f.process.emit(signal);
    expect(f.server.close).toHaveBeenCalledTimes(1);
    expect(f.database().isOpen).toBe(true);
    expect(f.database().prepare('SELECT version FROM schema_version').get()).toEqual({ version: 1 });
    expect(vi.getTimerCount()).toBe(1);
    f.drain();
    expect(f.database().isOpen).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10000);
    expect(f.server.closeAllConnections).not.toHaveBeenCalled();
    expect(f.process.exitCode).toBeUndefined();
    expect(f.logger.error).not.toHaveBeenCalled();
  });

  it('ignores the second signal while draining and after shutdown completes', () => {
    const f = fixture();
    startLifecycle(f.dependencies);
    f.process.emit('SIGTERM');
    f.process.emit('SIGINT');
    expect(f.server.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    expect(f.database().isOpen).toBe(true);
    f.drain();
    f.process.emit('SIGTERM');
    f.process.emit('SIGINT');
    expect(f.server.close).toHaveBeenCalledTimes(1);
    expect(f.database().isOpen).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forces connections closed only at the deadline and safely handles a late drain callback', () => {
    const f = fixture();
    startLifecycle(f.dependencies);
    f.process.emit('SIGTERM');
    vi.advanceTimersByTime(9999);
    expect(f.server.closeAllConnections).not.toHaveBeenCalled();
    expect(f.database().isOpen).toBe(true);
    vi.advanceTimersByTime(1);
    expect(f.server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(f.database().isOpen).toBe(false);
    expect(f.process.exitCode).toBe(1);
    expect(f.logger.error.mock.calls).toEqual([['API shutdown deadline exceeded']]);
    const close = vi.spyOn(f.database(), 'close');
    f.drain();
    expect(close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.process.exitCode).toBe(1);
  });

  it('closes storage even when the listener drain callback reports an error', () => {
    const f = fixture();
    startLifecycle(f.dependencies);
    f.process.emit('SIGINT');
    f.drain(new Error('private close failure'));
    expect(f.database().isOpen).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.logger.error.mock.calls).toEqual([['API shutdown failed']]);
    expect(f.process.exitCode).toBe(1);
  });

  it('contains a database close exception without exiting or disclosing diagnostics', () => {
    const f = fixture();
    startLifecycle(f.dependencies);
    // Fault injection only at cleanup; the connection and all queries remain real.
    vi.spyOn(f.database(), 'close').mockImplementation(() => { throw new Error('private SQLite path'); });
    f.process.emit('SIGTERM');
    expect(() => f.drain()).not.toThrow();
    expect(f.database().isOpen).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.logger.error.mock.calls).toEqual([['Database shutdown failed']]);
    expect(f.process.exitCode).toBe(1);
  });
});
