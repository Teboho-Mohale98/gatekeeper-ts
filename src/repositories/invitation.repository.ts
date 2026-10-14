/**
 * Invitation persistence contract + an in-memory implementation.
 *
 * The service layer depends only on the `InvitationRepository` interface, so
 * swapping the in-memory Map for Redis/Postgres later is a container-wiring
 * change, not a business-logic change.
 */

import type { VisitorInvitation } from '../types/domain';

export interface InvitationRepository {
  /** Insert or replace an invitation. Returns the stored record. */
  save(invitation: VisitorInvitation): VisitorInvitation;
  findById(id: string): VisitorInvitation | undefined;
  /** Lookup by canonicalised access code. */
  findByAccessCode(accessCode: string): VisitorInvitation | undefined;
  /** Lookup by canonicalised license plate. */
  findByLicensePlate(licensePlate: string): VisitorInvitation | undefined;
  /** All invitations, newest first. */
  list(): readonly VisitorInvitation[];
}

/**
 * Thread-safe-enough (single-threaded event loop) in-memory store with
 * secondary indices on the two credential keys we look up by.
 */
export class InMemoryInvitationRepository implements InvitationRepository {
  private readonly byId = new Map<string, VisitorInvitation>();
  private readonly byAccessCode = new Map<string, string>();
  private readonly byLicensePlate = new Map<string, string>();

  public save(invitation: VisitorInvitation): VisitorInvitation {
    this.byId.set(invitation.id, invitation);
    this.byAccessCode.set(invitation.accessCode, invitation.id);
    this.byLicensePlate.set(invitation.licensePlate, invitation.id);
    return invitation;
  }

  public findById(id: string): VisitorInvitation | undefined {
    return this.byId.get(id);
  }

  public findByAccessCode(accessCode: string): VisitorInvitation | undefined {
    const id = this.byAccessCode.get(accessCode);
    return id === undefined ? undefined : this.byId.get(id);
  }

  public findByLicensePlate(licensePlate: string): VisitorInvitation | undefined {
    const id = this.byLicensePlate.get(licensePlate);
    return id === undefined ? undefined : this.byId.get(id);
  }

  public list(): readonly VisitorInvitation[] {
    return [...this.byId.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}
