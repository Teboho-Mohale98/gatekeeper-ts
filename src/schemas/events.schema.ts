/**
 * Validation schemas for the WebSocket protocol.
 *
 * Inbound frames are untrusted and parsed with Zod before touching server
 * state. The outbound schema exists so external consumers (dashboards, the
 * simulator) can validate what we send them.
 */

import { z } from 'zod';
import {
  accessMethodSchema,
  accessResultStatusSchema,
  gateStatusSchema,
  rejectionReasonSchema,
} from './common.schema';

/* ------------------------------ client -> server -------------------------- */

export const clientMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SUBSCRIBE'),
      payload: z
        .object({
          gateId: z.string().trim().min(1).max(64).nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('PING'),
      payload: z
        .object({
          timestamp: z.string().datetime({ offset: true }),
        })
        .strict(),
    })
    .strict(),
]);

export type ClientMessageInput = z.infer<typeof clientMessageSchema>;

/* ------------------------------ server -> client -------------------------- */

const accessEventSchema = z.object({
  type: z.literal('ACCESS_EVENT'),
  payload: z.object({
    decisionId: z.string(),
    timestamp: z.string(),
    gateId: z.string(),
    accessMethod: accessMethodSchema,
    granted: z.boolean(),
    status: accessResultStatusSchema,
    rejectionReason: rejectionReasonSchema.nullable(),
    residentUnit: z.string().nullable(),
    visitorName: z.string().nullable(),
    credentialPayload: z.string(),
  }),
});

const invitationEventSchema = z.object({
  type: z.literal('INVITATION_EVENT'),
  payload: z.object({
    action: z.enum(['CREATED', 'REVOKED', 'EXHAUSTED', 'EXPIRED']),
    invitationId: z.string(),
    residentUnit: z.string(),
    visitorName: z.string(),
    licensePlate: z.string(),
    expiresAt: z.string(),
    maxUses: z.number(),
    currentUses: z.number(),
  }),
});

const gateStatusEventSchema = z.object({
  type: z.literal('GATE_STATUS'),
  payload: z.object({
    gateId: z.string(),
    previous: gateStatusSchema,
    current: gateStatusSchema,
    timestamp: z.string(),
  }),
});

const welcomeEventSchema = z.object({
  type: z.literal('WELCOME'),
  payload: z.object({
    clientId: z.string(),
    serverTime: z.string(),
    protocol: z.literal('gatekeeper.v1'),
  }),
});

export const serverMessageSchema = z.discriminatedUnion('type', [
  welcomeEventSchema,
  accessEventSchema,
  invitationEventSchema,
  gateStatusEventSchema,
]);

export type ServerMessageInput = z.infer<typeof serverMessageSchema>;
