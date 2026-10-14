/**
 * Gate registry.
 *
 * Owns the live hardware state of every physical gate/boom. It is the single
 * writer of {@link GateStatus} transitions and broadcasts each change on the
 * realtime channel, so dashboards never have to poll.
 */

import type { Logger } from '../lib/logger';
import { NotFoundError } from '../lib/errors';
import type { RealtimePublisher } from '../realtime/publisher';
import type { Gate, GateStatus } from '../types/domain';

export interface GateStatusChangeOptions {
  /**
   * When `false` the transition is applied silently. The access engine uses
   * this for transient `PROCESSING` states it does not want to broadcast.
   */
  readonly notify?: boolean;
}

export class GateRegistry {
  private readonly gates = new Map<string, Gate>();

  public constructor(
    gateIds: readonly string[],
    private readonly publisher: RealtimePublisher,
    private readonly logger: Logger,
  ) {
    const now = new Date().toISOString();
    for (const gateId of gateIds) {
      this.gates.set(gateId, {
        gateId,
        name: gateId,
        status: 'IDLE',
        lastHeartbeatAt: now,
      });
    }
  }

  public has(gateId: string): boolean {
    return this.gates.has(gateId);
  }

  public get(gateId: string): Gate | undefined {
    return this.gates.get(gateId);
  }

  public list(): readonly Gate[] {
    return [...this.gates.values()];
  }

  public count(): number {
    return this.gates.size;
  }

  /**
   * Transition a gate to a new status. Unknown gates raise {@link NotFoundError}
   * so a misconfigured reader fails loudly instead of silently no-op'ing.
   */
  public setStatus(
    gateId: string,
    status: GateStatus,
    options: GateStatusChangeOptions = {},
  ): Gate {
    const gate = this.gates.get(gateId);
    if (gate === undefined) {
      throw new NotFoundError(`Unknown gate '${gateId}'`);
    }

    const previous = gate.status;
    if (previous === status) {
      return gate;
    }

    const updated: Gate = {
      ...gate,
      status,
      lastHeartbeatAt: new Date().toISOString(),
    };
    this.gates.set(gateId, updated);

    if (options.notify !== false) {
      this.publisher.publish({
        type: 'GATE_STATUS',
        payload: {
          gateId,
          previous,
          current: status,
          timestamp: new Date().toISOString(),
        },
      });
      this.logger.debug('Gate status changed', { gateId, previous, current: status });
    }

    return updated;
  }

  /** Record a liveness ping without changing the gate's status. */
  public heartbeat(gateId: string): void {
    const gate = this.gates.get(gateId);
    if (gate === undefined) {
      throw new NotFoundError(`Unknown gate '${gateId}'`);
    }
    this.gates.set(gateId, { ...gate, lastHeartbeatAt: new Date().toISOString() });
  }
}
