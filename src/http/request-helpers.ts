/**
 * Small helpers for safely reading untrusted request input.
 */

import type { Request } from 'express';
import { ValidationError } from '../lib/errors';

/**
 * Read a required path parameter. Express types parameters as an index
 * signature, so under `noUncheckedIndexedAccess` every access is
 * `string | undefined`; this narrows it while producing a proper 400.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (value === undefined || value.length === 0) {
    throw new ValidationError(`Missing required path parameter '${name}'`);
  }
  return value;
}
