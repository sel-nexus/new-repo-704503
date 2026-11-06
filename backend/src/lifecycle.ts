/** Own startup and bounded shutdown without binding to the global process. */
import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config';

interface Listener {
  on(event: 'error', callback: () => void): unknown;
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections(): void;
}

interface Dependencies {
  loadConfig(): Config;
  openDatabase(url: string): DatabaseSync;
  listen(config: Config, database: DatabaseSync, ready: () => void): Listener;
  process: {
    once(signal: 'SIGTERM' | 'SIGINT', callback: () => void): unknown;
    exitCode?: number | string;
  };
  logger: Pick<Console, 'error' | 'info'>;
}

/** Start one connection and drain HTTP work before closing it.
 * Args:
 *   dependencies: Production adapters or controlled process/listener test adapters.
 * Notes:
 *   Failures set the supplied exit status without exiting; diagnostics stay generic.
 */
export function startLifecycle(dependencies: Dependencies): void {
  const { loadConfig, openDatabase, listen, process, logger } = dependencies;
  let database: DatabaseSync | undefined;
  /** Close the startup-owned connection without disclosing SQLite diagnostics. */
  function closeDatabase() {
    try {
      if (database?.isOpen) { database.close(); }
    } catch {
      logger.error('Database shutdown failed');
      process.exitCode = 1;
    }
  }

  try {
    const config = loadConfig();
    database = openDatabase(config.DATABASE_URL);
    const server = listen(config, database, () => {
      logger.info(`API listening on port ${config.PORT}`);
    });
    /** Report listener failure without leaking request or configuration values. */
    server.on('error', () => {
      closeDatabase();
      logger.error('API listener failed');
      process.exitCode = 1;
    });
    let shuttingDown = false;
    /** Allow active connections to finish, with a bounded shutdown deadline. */
    function shutdown() {
      if (shuttingDown) { return; }
      shuttingDown = true;
      const deadline = setTimeout(() => {
        logger.error('API shutdown deadline exceeded');
        server.closeAllConnections();
        closeDatabase();
        process.exitCode = 1;
      }, 10000);
      deadline.unref();
      server.close((error) => {
        clearTimeout(deadline);
        closeDatabase();
        if (error) { logger.error('API shutdown failed'); process.exitCode = 1; }
      });
    }
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch {
    closeDatabase();
    logger.error('API startup failed');
    process.exitCode = 1;
  }
}
