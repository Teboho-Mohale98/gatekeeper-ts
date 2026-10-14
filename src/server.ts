/**
 * Process entry point.
 *
 * Boots the container, builds the HTTP app, attaches the realtime hub to the
 * shared Node HTTP server (so HTTP and WebSocket share a port), and installs
 * graceful-shutdown handlers.
 */

import { createServer } from 'node:http';
import { createContainer } from './container';
import { createApp } from './http/app';
import { config } from './lib/env';
import { createLogger, type LogLevel } from './lib/logger';

function main(): void {
  const minLevel: LogLevel = config.isProduction ? 'info' : 'debug';
  const logger = createLogger('bootstrap', minLevel);

  const container = createContainer(config, logger);
  const app = createApp(container);
  const server = createServer(app);

  container.realtimeHub.attach(server);

  server.listen(config.port, () => {
    logger.info('GateKeeper TS listening', {
      port: config.port,
      env: config.nodeEnv,
      gates: config.gateIds,
      httpEndpoints: ['/health', '/api/invitations', '/api/access/verify', '/api/logs'],
      realtimePath: '/realtime',
    });
  });

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('Shutdown signal received', { signal });

    // Safety net: never hang forever waiting on lingering sockets.
    const forceExit = setTimeout(() => {
      logger.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(() => {
      void container.realtimeHub
        .close()
        .catch((error: unknown) => logger.warn('Error closing realtime hub', { error }))
        .finally(() => {
          logger.info('Shutdown complete');
          process.exit(0);
        });
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
