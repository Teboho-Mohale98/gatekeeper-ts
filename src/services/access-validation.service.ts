/**
 * Access validation engine.
 *
 * The heart of GateKeeper TS. Given a credential presented at a gate it runs an
 * ordered chain of business rules and produces an immutable {@link AccessDecision}
 * plus a POPIA-safe audit record:
 *
 *   1. Gate must exist and be online.
 *   2. The credential must resolve to a known invitation.
 *   3. The invitation must not be revoked.
 *   4. The invitation must not be expired.
 *   5. The presentation method must be permitted by the invitation.
 *   6. The invitation must not have exhausted its usage allowance.
 *   7. Otherwise: grant, increment usage, and drive the gate.
 *
 * The rule order is deliberate - cheapest checks first, and the most specific
 * rejection reason wins so operators get an actionable audit trail.
 */

import { REJECTION_MESSAGES } from '../lib/errors';
import { createId } from '../lib/ids';
import type { Logger } from '../lib/logger';
import { maskCredential, maskName } from '../lib/popia';
import {
  normaliseAccessCode,
  normaliseLicensePlate,
} from '../lib/text';
import type { AccessLogRepository } from '../repositories/access-log.repository';
import type { InvitationRepository } from '../repositories/invitation.repository';
import type { RealtimePublisher } from '../realtime/publisher';
import type { VerifyAccessRequest } from '../types/api';
import type {
  AccessDecision,
  AccessLog,
  AccessMethod,
  GateStatus,
  PresentedCredential,
  RejectionReason,
  VisitorInvitation,
} from '../types/domain';
import type { GateRegistry } from './gate-registry.service';
import type { VisitorService } from './visitor.service';

/** How long a gate holds a GRANTED/DENIED signal before returning to IDLE. */
const GATE_SIGNAL_MS = 2_500;

/** The full result of an evaluation, consumed by the HTTP route. */
export interface AccessEvaluation {
  readonly decision: AccessDecision;
  readonly log: AccessLog;
  readonly gateStatus: GateStatus;
  /** POPIA-masked visitor name, for the realtime event payload. */
  readonly visitorName: string | null;
}

interface Outcome {
  readonly granted: boolean;
  readonly rejectionReason: RejectionReason | null;
  readonly invitation: VisitorInvitation | null;
}

/** Narrow a validated API request down to the domain credential union. */
function toPresentedCredential(request: VerifyAccessRequest): PresentedCredential {
  switch (request.accessMethod) {
    case 'PIN_CODE':
      return { accessMethod: 'PIN_CODE', accessCode: request.accessCode };
    case 'LICENSE_PLATE':
      return { accessMethod: 'LICENSE_PLATE', licensePlate: request.licensePlate };
    case 'BLUETOOTH':
      return { accessMethod: 'BLUETOOTH', deviceToken: request.deviceToken };
    case 'FACIAL_RECOGNITION':
      return { accessMethod: 'FACIAL_RECOGNITION', faceTemplateId: request.faceTemplateId };
    case 'BIOMETRIC_READER':
      return { accessMethod: 'BIOMETRIC_READER', biometricHash: request.biometricHash };
  }
}

/** Extract the raw credential string carried by the presented credential. */
function credentialValue(credential: PresentedCredential): string {
  switch (credential.accessMethod) {
    case 'PIN_CODE':
      return credential.accessCode;
    case 'LICENSE_PLATE':
      return credential.licensePlate;
    case 'BLUETOOTH':
      return credential.deviceToken;
    case 'FACIAL_RECOGNITION':
      return credential.faceTemplateId;
    case 'BIOMETRIC_READER':
      return credential.biometricHash;
  }
}

export class AccessValidationService {
  public constructor(
    private readonly invitations: InvitationRepository,
    private readonly logs: AccessLogRepository,
    private readonly gates: GateRegistry,
    private readonly visitors: VisitorService,
    private readonly publisher: RealtimePublisher,
    private readonly logger: Logger,
  ) {}

  public verify(request: VerifyAccessRequest): AccessEvaluation {
    const credential = toPresentedCredential(request);
    const accessMethod: AccessMethod = credential.accessMethod;
    const rawCredential = credentialValue(credential);
    const gateId = request.gateId;

    // Rule 1 - the gate must exist and be online.
    const gate = this.gates.get(gateId);
    if (gate === undefined || gate.status === 'OFFLINE') {
      this.logger.warn('Access attempt at unavailable gate', { gateId });
      return this.finalise(gateId, accessMethod, rawCredential, {
        granted: false,
        rejectionReason: 'GATE_OFFLINE',
        invitation: null,
      }, 'OFFLINE');
    }

    // Rule 2 - the credential must map to a known invitation.
    const invitation = this.resolveInvitation(credential);
    if (invitation === undefined) {
      return this.finalise(gateId, accessMethod, rawCredential, {
        granted: false,
        rejectionReason: 'NO_MATCHING_INVITATION',
        invitation: null,
      }, 'DENIED');
    }

    // Refresh lifecycle (expiry) before evaluating the remaining rules.
    const current = this.visitors.expireIfNeeded(invitation);

    // Rule 3 - revoked invitations are terminal.
    if (current.status === 'REVOKED') {
      return this.reject(gateId, accessMethod, rawCredential, current, 'INVITATION_REVOKED');
    }

    // Rule 4 - expiry.
    if (current.status === 'EXPIRED' || Date.parse(current.expiresAt) <= Date.now()) {
      return this.reject(gateId, accessMethod, rawCredential, current, 'INVITATION_EXPIRED');
    }

    // Rule 5 - the invitation must permit this access method.
    if (!current.allowedMethods.includes(accessMethod)) {
      return this.reject(gateId, accessMethod, rawCredential, current, 'METHOD_NOT_PERMITTED');
    }

    // Rule 6 - usage allowance.
    if (current.currentUses >= current.maxUses) {
      return this.reject(gateId, accessMethod, rawCredential, current, 'USAGE_LIMIT_REACHED');
    }

    // Rule 7 - grant.
    const used = this.visitors.markUsed(current);
    this.logger.info('Access granted', {
      gateId,
      accessMethod,
      invitationId: used.id,
      residentUnit: used.residentUnit,
      currentUses: used.currentUses,
      maxUses: used.maxUses,
    });
    return this.finalise(gateId, accessMethod, rawCredential, {
      granted: true,
      rejectionReason: null,
      invitation: used,
    }, 'GRANTED');
  }

  private reject(
    gateId: string,
    accessMethod: AccessMethod,
    rawCredential: string,
    invitation: VisitorInvitation,
    reason: RejectionReason,
  ): AccessEvaluation {
    return this.finalise(gateId, accessMethod, rawCredential, {
      granted: false,
      rejectionReason: reason,
      invitation,
    }, 'DENIED');
  }

  /**
   * Persist the audit record, drive the gate, broadcast the event and assemble
   * the immutable decision. Every path through {@link verify} funnels here so
   * logging and signalling can never be skipped.
   */
  private finalise(
    gateId: string,
    accessMethod: AccessMethod,
    rawCredential: string,
    outcome: Outcome,
    gateStatus: GateStatus,
  ): AccessEvaluation {
    const timestamp = new Date().toISOString();
    const decisionId = createId('dec');
    const invitation = outcome.invitation;
    const maskedCredential = maskCredential(accessMethod, rawCredential);
    const visitorName = invitation === null ? null : maskName(invitation.visitorName);

    const detail = outcome.granted
      ? `Access granted${invitation === null ? '' : ` for ${maskName(invitation.visitorName)}`}.`
      : REJECTION_MESSAGES[outcome.rejectionReason ?? 'MALFORMED_CREDENTIAL'];

    const decision: AccessDecision = {
      decisionId,
      timestamp,
      gateId,
      accessMethod,
      granted: outcome.granted,
      rejectionReason: outcome.rejectionReason,
      invitationId: invitation === null ? null : invitation.id,
      residentUnit: invitation === null ? null : invitation.residentUnit,
      detail,
    };

    const log: AccessLog = {
      logId: createId('log'),
      timestamp,
      gateId,
      accessMethod,
      credentialPayload: maskedCredential,
      status: outcome.granted ? 'SUCCESS' : 'FAILED',
      ...(outcome.rejectionReason !== null
        ? { rejectionReason: outcome.rejectionReason }
        : {}),
      ...(invitation !== null ? { invitationId: invitation.id } : {}),
      ...(invitation !== null ? { residentUnit: invitation.residentUnit } : {}),
    };
    this.logs.append(log);

    // Drive the physical gate (state machine) when the gate is known + online.
    if (this.gates.has(gateId) && gateStatus !== 'OFFLINE') {
      this.gates.setStatus(gateId, gateStatus);
      this.scheduleIdleReset(gateId);
    }

    this.publisher.publish({
      type: 'ACCESS_EVENT',
      payload: {
        decisionId,
        timestamp,
        gateId,
        accessMethod,
        granted: outcome.granted,
        status: log.status,
        rejectionReason: outcome.rejectionReason,
        residentUnit: decision.residentUnit,
        visitorName,
        credentialPayload: maskedCredential,
      },
    });

    return { decision, log, gateStatus, visitorName };
  }

  /**
   * Resolve a presented credential to an invitation. PIN and license-plate
   * credentials are bound to invitations directly; reader-specific templates
   * (Bluetooth / face / biometric) are provisioned out-of-band and therefore
   * resolve to `undefined` in this reference engine, producing a clean denial.
   */
  private resolveInvitation(credential: PresentedCredential): VisitorInvitation | undefined {
    switch (credential.accessMethod) {
      case 'PIN_CODE':
        return this.invitations.findByAccessCode(normaliseAccessCode(credential.accessCode));
      case 'LICENSE_PLATE':
        return this.invitations.findByLicensePlate(
          normaliseLicensePlate(credential.licensePlate),
        );
      case 'BLUETOOTH':
      case 'FACIAL_RECOGNITION':
      case 'BIOMETRIC_READER':
        return undefined;
    }
  }

  /** Return a grant/deny signal to IDLE after a short, non-blocking delay. */
  private scheduleIdleReset(gateId: string): void {
    const timer = setTimeout(() => {
      const gate = this.gates.get(gateId);
      if (gate !== undefined && (gate.status === 'GRANTED' || gate.status === 'DENIED')) {
        this.gates.setStatus(gateId, 'IDLE');
      }
    }, GATE_SIGNAL_MS);
    timer.unref();
  }
}
