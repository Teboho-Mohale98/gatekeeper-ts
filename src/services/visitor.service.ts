/**
 * Visitor service - the write-side authority for invitations.
 *
 * Responsibilities:
 *  - mint cryptographically-random, time- and usage-bound access codes,
 *  - persist invitations through the repository port,
 *  - broadcast lifecycle events (created / revoked / exhausted / expired),
 *  - project invitations to a POPIA-safe public shape for API consumers.
 */

import type { AppConfig } from '../lib/env';
import { NotFoundError } from '../lib/errors';
import { createId, generateAccessCode } from '../lib/ids';
import type { Logger } from '../lib/logger';
import { maskIdNumber, maskPhoneNumber } from '../lib/popia';
import {
  normaliseLicensePlate,
  normaliseName,
  normaliseResidentUnit,
} from '../lib/text';
import type { RealtimePublisher } from '../realtime/publisher';
import type {
  CreateInvitationRequest,
  PublicInvitation,
} from '../types/api';
import type { AccessMethod, VisitorInvitation } from '../types/domain';
import type { InvitationRepository } from '../repositories/invitation.repository';

/** Default methods an invitation may be redeemed through. */
const DEFAULT_ALLOWED_METHODS: readonly AccessMethod[] = ['PIN_CODE', 'LICENSE_PLATE'];

/** Access code length in digits. */
const ACCESS_CODE_LENGTH = 6;

/** Guard against pathological loops if the code space were ever exhausted. */
const ACCESS_CODE_MAX_ATTEMPTS = 20;

export class VisitorService {
  public constructor(
    private readonly repository: InvitationRepository,
    private readonly publisher: RealtimePublisher,
    private readonly config: AppConfig,
    private readonly logger: Logger,
  ) {}

  /** Create a new invitation with configurable expiry and usage allowance. */
  public createInvitation(input: CreateInvitationRequest): VisitorInvitation {
    const now = new Date();
    const ttlMinutes = input.ttlMinutes ?? this.config.defaultInvitationTtlMinutes;
    const maxUses = input.maxUses ?? this.config.defaultInvitationMaxUses;
    const allowedMethods =
      input.allowedMethods !== undefined && input.allowedMethods.length > 0
        ? [...new Set(input.allowedMethods)]
        : DEFAULT_ALLOWED_METHODS;

    const invitation: VisitorInvitation = {
      id: createId('inv'),
      residentUnit: normaliseResidentUnit(input.residentUnit),
      visitorName: normaliseName(input.visitorName),
      licensePlate: normaliseLicensePlate(input.licensePlate),
      visitorIdNumber: input.visitorIdNumber.trim(),
      ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber.trim() } : {}),
      accessCode: this.generateUniqueAccessCode(),
      allowedMethods,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString(),
      maxUses,
      currentUses: 0,
      status: 'ACTIVE',
    };

    this.repository.save(invitation);
    this.logger.info('Invitation created', {
      invitationId: invitation.id,
      residentUnit: invitation.residentUnit,
      expiresAt: invitation.expiresAt,
      maxUses: invitation.maxUses,
    });
    this.publisher.publish({
      type: 'INVITATION_EVENT',
      payload: {
        action: 'CREATED',
        invitationId: invitation.id,
        residentUnit: invitation.residentUnit,
        visitorName: invitation.visitorName,
        licensePlate: invitation.licensePlate,
        expiresAt: invitation.expiresAt,
        maxUses: invitation.maxUses,
        currentUses: invitation.currentUses,
      },
    });

    return invitation;
  }

  public getById(id: string): VisitorInvitation {
    const invitation = this.repository.findById(id);
    if (invitation === undefined) {
      throw new NotFoundError(`Invitation '${id}' not found`);
    }
    return this.expireIfNeeded(invitation);
  }

  public list(): readonly VisitorInvitation[] {
    return this.repository.list().map((invitation) => this.expireIfNeeded(invitation));
  }

  /** Revoke an invitation ahead of its natural expiry. */
  public revoke(id: string): VisitorInvitation {
    const invitation = this.repository.findById(id);
    if (invitation === undefined) {
      throw new NotFoundError(`Invitation '${id}' not found`);
    }
    if (invitation.status === 'REVOKED') {
      return invitation;
    }

    const revoked: VisitorInvitation = { ...invitation, status: 'REVOKED' };
    this.repository.save(revoked);
    this.logger.info('Invitation revoked', { invitationId: id });
    this.broadcastLifecycle('REVOKED', revoked);
    return revoked;
  }

  /**
   * Lazily transition an `ACTIVE` invitation whose `expiresAt` has passed into
   * `EXPIRED`. Called on read paths so the audit trail stays truthful even
   * without a background sweeper.
   */
  public expireIfNeeded(invitation: VisitorInvitation): VisitorInvitation {
    if (invitation.status !== 'ACTIVE') {
      return invitation;
    }
    if (Date.parse(invitation.expiresAt) > Date.now()) {
      return invitation;
    }

    const expired: VisitorInvitation = { ...invitation, status: 'EXPIRED' };
    this.repository.save(expired);
    this.logger.info('Invitation expired', { invitationId: invitation.id });
    this.broadcastLifecycle('EXPIRED', expired);
    return expired;
  }

  /** Persist an updated invitation and, if exhausted, announce it. */
  public markUsed(invitation: VisitorInvitation): VisitorInvitation {
    const updated: VisitorInvitation = {
      ...invitation,
      currentUses: invitation.currentUses + 1,
    };
    this.repository.save(updated);

    if (updated.currentUses >= updated.maxUses) {
      this.broadcastLifecycle('EXHAUSTED', updated);
    }
    return updated;
  }

  /** Project an invitation to its POPIA-safe wire representation. */
  public toPublic(invitation: VisitorInvitation): PublicInvitation {
    return {
      id: invitation.id,
      residentUnit: invitation.residentUnit,
      visitorName: invitation.visitorName,
      licensePlate: invitation.licensePlate,
      maskedIdNumber: maskIdNumber(invitation.visitorIdNumber),
      ...(invitation.phoneNumber !== undefined
        ? { maskedPhoneNumber: maskPhoneNumber(invitation.phoneNumber) }
        : {}),
      accessCode: invitation.accessCode,
      allowedMethods: invitation.allowedMethods,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      maxUses: invitation.maxUses,
      currentUses: invitation.currentUses,
      status: invitation.status,
    };
  }

  private generateUniqueAccessCode(): string {
    for (let attempt = 0; attempt < ACCESS_CODE_MAX_ATTEMPTS; attempt += 1) {
      const candidate = generateAccessCode(ACCESS_CODE_LENGTH);
      if (this.repository.findByAccessCode(candidate) === undefined) {
        return candidate;
      }
    }
    throw new Error('Unable to generate a unique access code');
  }

  private broadcastLifecycle(
    action: 'REVOKED' | 'EXHAUSTED' | 'EXPIRED',
    invitation: VisitorInvitation,
  ): void {
    this.publisher.publish({
      type: 'INVITATION_EVENT',
      payload: {
        action,
        invitationId: invitation.id,
        residentUnit: invitation.residentUnit,
        visitorName: invitation.visitorName,
        licensePlate: invitation.licensePlate,
        expiresAt: invitation.expiresAt,
        maxUses: invitation.maxUses,
        currentUses: invitation.currentUses,
      },
    });
  }
}
