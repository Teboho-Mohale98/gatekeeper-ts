/**
 * Vercel serverless entry point.
 *
 * Vercel's zero-configuration Node backend contract for WebSockets is to
 * default-export a Node `http.Server`. We assemble exactly the same
 * container/app as the long-running process entry (`server.ts`) and attach the
 * realtime hub, but deliberately *never* call `listen()` - the platform owns
 * the socket lifecycle and hands us the incoming requests.
 *
 * HTTP and WebSocket share this single server instance, so `/health`,
 * `/api/*` and the `/realtime` upgrade path are all served here.
 *
 * Note: state is in-memory, so it resets on cold start and is not shared
 * across function instances. That is an acceptable trade-off for the demo; a
 * production deployment would back the repositories with a shared store.
 */

import express from 'express';
import { createServer } from 'node:http';
import { createContainer } from './container';
import { configureApp } from './http/app';
import { config } from './lib/env';
import { createLogger } from './lib/logger';

const logger = createLogger('vercel', config.isProduction ? 'info' : 'debug');

const container = createContainer(config, logger);
const app = configureApp(express(), container);
const server = createServer(app);

container.realtimeHub.attach(server);

export default server;
