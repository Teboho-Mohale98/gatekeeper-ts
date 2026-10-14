/**
 * Wire-level contracts for the HTTP API.
 *
 * Request types deliberately mirror the domain so that a validated request can
 * be handed to a service without an intermediate mapping layer. Response types
 * are *projections*: they intentionally omit or mask POPIA-sensitive fields.
 */

import type {
  AccessDecision,
  AccessLog,
  AccessMethod,
  AccessResultStatus,
  GateStatus,
  VisitorInvitation,
} from './domain';

/* -------------------------------------------------------------------------- */
/* POST /api/invitations                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Optional fields are declared as `T | undefined` (rather than bare `?: T`) so
 * that the Zod-inferred input can be passed straight through under
 * `exactOptionalPropertyTypes`.
 */
export interface CreateInvitationRequest {
  residentUnit: string;
  visitorName: string;
  licensePlate: string;
  visitorIdNumber: string;
  phoneNumber?: string | undefined;
  /** Defaults to a sensible subset of methods when omitted. */
  allowedMethods?: readonly AccessMethod[] | undefined;
  /** Overrides the environment default TTL. */
  ttlMinutes?: number | undefined;
  /** Overrides the environment default usage allowance. */
  maxUses?: number | undefined;
}

/**
 * A POPIA-safe projection of an invitation. The resident receives this so they
 * can forward the `accessCode` to their visitor, but the visitor's ID number is
 * masked rather than echoed back in full.
 */
export interface PublicInvitation {
  id: string;
  residentUnit: string;
  visitorName: string;
  licensePlate: string;
  maskedIdNumber: string;
  maskedPhoneNumber?: string;
  accessCode: string;
  allowedMethods: readonly AccessMethod[];
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  currentUses: number;
  status: VisitorInvitation['status'];
}

export interface CreateInvitationResponse {
  invitation: PublicInvitation;
}

/* -------------------------------------------------------------------------- */
/* POST /api/access/verify                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A discriminated union on `accessMethod`. Each variant carries exactly the
 * credential field its reader physically produces - nothing more, nothing less.
 */
export type VerifyAccessRequest =
  | { gateId: string; accessMethod: 'PIN_CODE'; accessCode: string }
  | { gateId: string; accessMethod: 'LICENSE_PLATE'; licensePlate: string }
  | { gateId: string; accessMethod: 'BLUETOOTH'; deviceToken: string }
  | { gateId: string; accessMethod: 'FACIAL_RECOGNITION'; faceTemplateId: string }
  | { gateId: string; accessMethod: 'BIOMETRIC_READER'; biometricHash: string };

export interface VerifyAccessResponse {
  decision: AccessDecision;
  /** Post-decision hardware state, so a controller can drive its boom/LED. */
  gateStatus: GateStatus;
  logId: string;
}

/* -------------------------------------------------------------------------- */
/* GET /api/logs                                                               */
/* -------------------------------------------------------------------------- */

export interface AccessLogQuery {
  gateId?: string;
  status?: AccessResultStatus;
  accessMethod?: AccessMethod;
  residentUnit?: string;
  /** Inclusive lower bound (ISO-8601). */
  from?: string;
  /** Inclusive upper bound (ISO-8601). */
  to?: string;
  limit: number;
}

export interface AccessLogListResponse {
  total: number;
  count: number;
  limit: number;
  logs: readonly AccessLog[];
}

/* -------------------------------------------------------------------------- */
/* GET /health                                                                 */
/* -------------------------------------------------------------------------- */

export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
  gateCount: number;
  timestamp: string;
}
