/** Start the API listener and drain connections on termination. */
import { loadConfig } from './config';
import { createApp } from './app';

try {
  const config = loadConfig();
  const server = createApp(config).listen(config.PORT, config.HOST, () => {
    console.info(`API listening on port ${config.PORT}`);
  });
  /** Report listener failure without leaking request or configuration values. */
  server.on('error', () => {
    console.error('API listener failed');
    process.exitCode = 1;
  });
  /** Allow active connections to finish, with a bounded shutdown deadline. */
  function shutdown() {
    const deadline = setTimeout(() => {
      console.error('API shutdown deadline exceeded');
      server.closeAllConnections();
      process.exitCode = 1;
    }, 10000);
    deadline.unref();
    server.close((error) => {
      clearTimeout(deadline);
      if (error) { console.error('API shutdown failed'); process.exitCode = 1; }
    });
  }
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API startup failed');
  process.exitCode = 1;
}
