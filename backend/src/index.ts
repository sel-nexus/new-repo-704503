/** Start one SQLite connection and drain HTTP work before closing it. */
import { loadConfig } from './config';
import { createApp } from './app';
import { openDatabase } from './db/connection';
import type { DatabaseSync } from 'node:sqlite';

let database: DatabaseSync | undefined;
/** Close the startup-owned connection without disclosing SQLite diagnostics. */
function closeDatabase() {
  try {
    if (database?.isOpen) { database.close(); }
  } catch {
    console.error('Database shutdown failed');
    process.exitCode = 1;
  }
}

try {
  const config = loadConfig();
  database = openDatabase(config.DATABASE_URL);
  const server = createApp({ ...config, database }).listen(config.PORT, config.HOST, () => {
    console.info(`API listening on port ${config.PORT}`);
  });
  /** Report listener failure without leaking request or configuration values. */
  server.on('error', () => {
    closeDatabase();
    console.error('API listener failed');
    process.exitCode = 1;
  });
  /** Allow active connections to finish, with a bounded shutdown deadline. */
  let shuttingDown = false;
  function shutdown() {
    if (shuttingDown) { return; }
    shuttingDown = true;
    const deadline = setTimeout(() => {
      console.error('API shutdown deadline exceeded');
      server.closeAllConnections();
      closeDatabase();
      process.exitCode = 1;
    }, 10000);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      closeDatabase();
      if (error) { console.error('API shutdown failed'); process.exitCode = 1; }
    });
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch {
  closeDatabase();
  console.error('API startup failed');
  process.exitCode = 1;
}
