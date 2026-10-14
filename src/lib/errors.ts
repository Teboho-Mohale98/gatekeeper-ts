/**
 * Application error hierarchy.
 *
 * Every error the HTTP layer is expected to surface carries an HTTP status and
 * a stable machine-readable `code`. Anything else that reaches the error
 * middleware is treated as an unexpected 500 and its message is not leaked.
 */

import type { RejectionReason } from '../types/domain';

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: AppErrorCode;
  public readonly details: readonly unknown[];

  public constructor(
    message: string,
    statusCode: number,
    code: AppErrorCode,
    details: readonly unknown[] = [],
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, new.target);
  }
}

export class ValidationError extends AppError {
  public constructor(message = 'Request validation failed', details: readonly unknown[] = []) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  public constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  public constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class UnprocessableError extends AppError {
  public constructor(message = 'Request could not be processed') {
    super(message, 422, 'UNPROCESSABLE');
  }
}

/** Narrowing guard - lets middleware distinguish "expected" from "boom". */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Last-resort mapping from a `RejectionReason` to an operator-facing message.
 * Kept here (rather than in the service) so both HTTP responses and real-time
 * broadcasts speak the same language.
 */
export const REJECTION_MESSAGES: Readonly<Record<RejectionReason, string>> = {
  NO_MATCHING_INVITATION: 'No active invitation matches the presented credential.',
  INVITATION_REVOKED: 'The invitation has been revoked by the resident.',
  INVITATION_EXPIRED: 'The invitation has passed its expiry time.',
  USAGE_LIMIT_REACHED: 'The invitation has reached its maximum number of uses.',
  METHOD_NOT_PERMITTED: 'The invitation does not permit this access method.',
  GATE_OFFLINE: 'The gate controller is offline.',
  MALFORMED_CREDENTIAL: 'The credential payload was malformed.',
};
