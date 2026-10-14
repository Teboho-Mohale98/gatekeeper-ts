/**
 * Adapter that lets async route handlers propagate rejections into Express's
 * error pipeline. Without this, a rejected promise in a handler becomes an
 * unhandled rejection instead of a clean HTTP error response.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
