/** Start one SQLite connection and drain HTTP work before closing it. */
import { loadConfig } from './config';
import { createApp } from './app';
import { openDatabase } from './db/connection';
import { startLifecycle } from './lifecycle';

startLifecycle({
  loadConfig,
  openDatabase,
  /** Bind the configured interface while retaining the startup-owned database. */
  listen: (config, database, ready) => createApp({ ...config, database }).listen(config.PORT, config.HOST, ready),
  process,
  logger: console
});
