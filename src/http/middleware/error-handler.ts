/**
 * Centralised error translation.
 *
 * Maps the three families of failure onto a single, stable JSON envelope:
 *   - Zod validation failures  -> 400 with field-level issues,
 *   - domain {@link AppError}s  -> their declared status + code,
 *   - anything else             -> 500, message withheld from the client.
 */

import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { isAppError } from '../../lib/errors';
import type { Logger } from '../../lib/logger';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: readonly unknown[];
  };
}

/** Shape of errors thrown by Connect/body-parser (e.g. malformed JSON). */
interface HttpLikeError {
  status?: number;
  statusCode?: number;
  message?: string;
  type?: string;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('status' in error || 'statusCode' in error)
  );
}

function statusFromHttpLike(error: HttpLikeError): number {
  const candidate = error.status ?? error.statusCode;
  if (typeof candidate === 'number' && candidate >= 400 && candidate <= 599) {
    return candidate;
  }
  return 500;
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    if (error instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues,
        },
      };
      res.status(400).json(body);
      return;
    }

    if (isAppError(error)) {
      if (error.statusCode >= 500) {
        logger.error(error.message, { code: error.code, error });
      } else {
        logger.warn(error.message, { code: error.code });
      }
      const body: ApiErrorBody = {
        error: { code: error.code, message: error.message, details: error.details },
      };
      res.status(error.statusCode).json(body);
      return;
    }

    if (isHttpLikeError(error)) {
      const status = statusFromHttpLike(error);
      const body: ApiErrorBody = {
        error: {
          code: status === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
          message: error.message ?? 'Request could not be processed',
          details: [],
        },
      };
      res.status(status).json(body);
      return;
    }

    logger.error('Unhandled error', { error });
    const body: ApiErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        details: [],
      },
    };
    res.status(500).json(body);
  };
}
