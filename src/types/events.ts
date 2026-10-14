/**
 * Real-time event contracts.
 *
 * The WebSocket transport is a thin pipe over these messages. Both directions
 * are modelled as discriminated unions so that a `switch (message.type)` is
 * exhaustive and the compiler flags any unhandled frame.
 */

import type { AccessMethod, AccessResultStatus, GateStatus, RejectionReason } from './domain';

/* -------------------------------------------------------------------------- */
/* Server -> client                                                            */
/* -------------------------------------------------------------------------- */

/** Emitted once, immediately after a socket connects. */
export interface WelcomeEvent {
  type: 'WELCOME';
  payload: {
    clientId: string;
    serverTime: string;
    /** Human-readable protocol version, useful for rollout safety. */
    protocol: 'gatekeeper.v1';
  };
}

/** Emitted for every gate scan, successful or otherwise. */
export interface AccessEvent {
  type: 'ACCESS_EVENT';
  payload: {
    decisionId: string;
    timestamp: string;
    gateId: string;
    accessMethod: AccessMethod;
    granted: boolean;
    status: AccessResultStatus;
    rejectionReason: RejectionReason | null;
    residentUnit: string | null;
    visitorName: string | null;
    /** POPIA-safe, already-masked credential. */
    credentialPayload: string;
  };
}

/** Emitted when a resident creates (or the engine revokes) an invitation. */
export interface InvitationEvent {
  type: 'INVITATION_EVENT';
  payload: {
    action: 'CREATED' | 'REVOKED' | 'EXHAUSTED' | 'EXPIRED';
    invitationId: string;
    residentUnit: string;
    visitorName: string;
    licensePlate: string;
    expiresAt: string;
    maxUses: number;
    currentUses: number;
  };
}

/** Emitted when a gate changes hardware state. */
export interface GateStatusEvent {
  type: 'GATE_STATUS';
  payload: {
    gateId: string;
    previous: GateStatus;
    current: GateStatus;
    timestamp: string;
  };
}

export type ServerMessage =
  | WelcomeEvent
  | AccessEvent
  | InvitationEvent
  | GateStatusEvent;

export type ServerMessageType = ServerMessage['type'];

/* -------------------------------------------------------------------------- */
/* Client -> server                                                            */
/* -------------------------------------------------------------------------- */

/** Optional filter so a dashboard can subscribe to a single gate. */
export interface SubscribeCommand {
  type: 'SUBSCRIBE';
  payload: { gateId: string | null };
}

export interface PingCommand {
  type: 'PING';
  payload: { timestamp: string };
}

export type ClientMessage = SubscribeCommand | PingCommand;

/** Reply to a `PING`. */
export interface PongCommand {
  type: 'PONG';
  payload: { timestamp: string };
}
