/**
 * GateKeeper TS - core domain model.
 *
 * These types are the single source of truth for the platform's vocabulary.
 * Runtime validation schemas (see `src/schemas`) are derived from the same
 * literal tuples defined here, so the compile-time and runtime contracts can
 * never drift apart.
 */

/* -------------------------------------------------------------------------- */
/* Credential / hardware vocabulary                                            */
/* -------------------------------------------------------------------------- */

/**
 * The physical or digital channel through which a credential can be presented
 * at a gate. Mirrors the reader types found on ClickOn-style estate hardware.
 */
export const ACCESS_METHODS = [
  'PIN_CODE',
  'LICENSE_PLATE',
  'BLUETOOTH',
  'FACIAL_RECOGNITION',
  'BIOMETRIC_READER',
] as const;

export type AccessMethod = (typeof ACCESS_METHODS)[number];

/**
 * Lifecycle of a single gate controller. A gate is only able to make a
 * grant/deny decision while it is `IDLE`; `PROCESSING` represents the brief
 * window during credential evaluation.
 */
export const GATE_STATUSES = [
  'IDLE',
  'PROCESSING',
  'GRANTED',
  'DENIED',
  'OFFLINE',
] as const;

export type GateStatus = (typeof GATE_STATUSES)[number];

/** A physical gate/boom that belongs to an estate. */
export interface Gate {
  readonly gateId: string;
  name: string;
  status: GateStatus;
  lastHeartbeatAt: string;
}

/* -------------------------------------------------------------------------- */
/* Visitor invitations                                                         */
/* -------------------------------------------------------------------------- */

export const INVITATION_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/**
 * A resident-issued pre-clearance record. It grants a named visitor time-bound
 * and usage-bound access to the estate.
 */
export interface VisitorInvitation {
  readonly id: string;
  /** The resident unit the visitor is authorised to visit, e.g. "BLOCK-C-12". */
  residentUnit: string;
  visitorName: string;
  /** Normalised (upper-case, space-stripped) license plate. */
  licensePlate: string;
  /** South African ID number. POPIA sensitive - never written raw to the audit log. */
  visitorIdNumber: string;
  /** Optional contact number. POPIA sensitive. */
  phoneNumber?: string;
  /** Short numeric code a visitor can type on a keypad reader. */
  accessCode: string;
  /** Methods this invitation may be redeemed through. */
  allowedMethods: readonly AccessMethod[];
  readonly createdAt: string;
  /** ISO-8601 instant after which the invitation is no longer valid. */
  expiresAt: string;
  maxUses: number;
  currentUses: number;
  status: InvitationStatus;
}

/* -------------------------------------------------------------------------- */
/* Access decisions & audit log                                                */
/* -------------------------------------------------------------------------- */

export const ACCESS_RESULT_STATUSES = ['SUCCESS', 'FAILED'] as const;
export type AccessResultStatus = (typeof ACCESS_RESULT_STATUSES)[number];

/**
 * Exhaustive, machine-readable catalogue of every reason an access request can
 * be turned away. Keeping this as a closed union means consumers (UI, audit,
 * analytics) can switch over it exhaustively.
 */
export const REJECTION_REASONS = [
  'NO_MATCHING_INVITATION',
  'INVITATION_REVOKED',
  'INVITATION_EXPIRED',
  'USAGE_LIMIT_REACHED',
  'METHOD_NOT_PERMITTED',
  'GATE_OFFLINE',
  'MALFORMED_CREDENTIAL',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

/**
 * The raw credential presented at a reader. The shape is a discriminated union
 * on `accessMethod` so a validator can never read the wrong field.
 */
export type PresentedCredential =
  | { readonly accessMethod: 'PIN_CODE'; readonly accessCode: string }
  | { readonly accessMethod: 'LICENSE_PLATE'; readonly licensePlate: string }
  | { readonly accessMethod: 'BLUETOOTH'; readonly deviceToken: string }
  | { readonly accessMethod: 'FACIAL_RECOGNITION'; readonly faceTemplateId: string }
  | { readonly accessMethod: 'BIOMETRIC_READER'; readonly biometricHash: string };

/** The immutable outcome of an access evaluation. */
export interface AccessDecision {
  readonly decisionId: string;
  readonly timestamp: string;
  readonly gateId: string;
  readonly accessMethod: AccessMethod;
  readonly granted: boolean;
  readonly rejectionReason: RejectionReason | null;
  readonly invitationId: string | null;
  readonly residentUnit: string | null;
  /** Human readable, POPIA-safe summary suitable for operators and logs. */
  readonly detail: string;
}

/**
 * A persisted (long-term) audit record. Every field is already POPIA-masked by
 * the time it reaches this shape; raw personal data never lands here.
 */
export interface AccessLog {
  readonly logId: string;
  readonly timestamp: string;
  readonly gateId: string;
  readonly accessMethod: AccessMethod;
  /** Masked credential (e.g. `12**`, `CA *** 123`). */
  readonly credentialPayload: string;
  readonly status: AccessResultStatus;
  readonly rejectionReason?: RejectionReason;
  readonly invitationId?: string;
  readonly residentUnit?: string;
}
