/**
 * Minimal dependency-free CORS middleware.
 *
 * The platform is expected to be fronted by estate dashboards during local
 * development, so a permissive policy keeps the demo friction-free without
 * pulling in an extra package.
 */

import type { RequestHandler } from 'express';

export const corsMiddleware: RequestHandler = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
};
