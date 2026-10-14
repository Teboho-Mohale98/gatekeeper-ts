/**
 * Shared Zod primitives.
 *
 * Every schema is built from the literal tuples exported by the domain model so
 * that adding a new access method (or gate status) is a one-line change that
 * propagates to validation, types and docs simultaneously.
 */

import { z } from 'zod';
import {
  ACCESS_METHODS,
  ACCESS_RESULT_STATUSES,
  GATE_STATUSES,
  INVITATION_STATUSES,
  REJECTION_REASONS,
} from '../types/domain';

export const accessMethodSchema = z.enum(ACCESS_METHODS);
export const gateStatusSchema = z.enum(GATE_STATUSES);
export const invitationStatusSchema = z.enum(INVITATION_STATUSES);
export const accessResultStatusSchema = z.enum(ACCESS_RESULT_STATUSES);
export const rejectionReasonSchema = z.enum(REJECTION_REASONS);

/** A non-empty, reasonably bounded identifier (gate ids, unit labels, ...). */
export const identifierSchema = z.string().trim().min(1).max(64);

/** ISO-8601 timestamp with an explicit offset or `Z`. */
export const isoDateTimeSchema = z.string().datetime({ offset: true });
