/**
 * Fallback for unmatched routes, so clients always receive the same JSON error
 * envelope rather than Express's default HTML 404 page.
 */

import type { RequestHandler } from 'express';
import type { ApiErrorBody } from './error-handler';

export const notFoundHandler: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: {
      code: 'NOT_FOUND',
      message: `Route '${req.method} ${req.path}' not found`,
      details: [],
    },
  };
  res.status(404).json(body);
};
