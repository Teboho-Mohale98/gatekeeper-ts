/**
 * Express application factory.
 *
 * Wires middleware and routers onto a fresh app. Kept free of `listen()` so the
 * same factory can be used by the HTTP server, integration tests, or a future
 * serverless adapter.
 */

import express, { type Express } from 'express';
import type { AppContainer } from '../container';
import { corsMiddleware } from './middleware/cors';
import { createErrorHandler } from './middleware/error-handler';
import { notFoundHandler } from './middleware/not-found';
import { createAccessRouter } from './routes/access.routes';
import { createHealthRouter } from './routes/health.routes';
import { createInvitationRouter } from './routes/invitation.routes';
import { createAccessLogRouter } from './routes/log.routes';

export function createApp(container: AppContainer): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(corsMiddleware);
  app.use(express.json({ limit: '64kb' }));

  app.use('/health', createHealthRouter(container));
  app.use('/api/invitations', createInvitationRouter(container));
  app.use('/api/access', createAccessRouter(container));
  app.use('/api/logs', createAccessLogRouter(container));

  // Order matters: 404 first, then the terminal error translator.
  app.use(notFoundHandler);
  app.use(createErrorHandler(container.logger));

  return app;
}
