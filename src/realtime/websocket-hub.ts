/**
 * WebSocket fan-out hub.
 *
 * Wraps a `ws` server and implements {@link RealtimePublisher}. Responsibilities
 * are intentionally narrow:
 *   1. accept + greet connections,
 *   2. validate inbound frames with Zod,
 *   3. honour per-client gate subscriptions,
 *   4. broadcast typed {@link ServerMessage} envelopes.
 *
 * Business logic lives in the services; this class knows nothing about
 * invitations or validation rules.
 */

import type { Server } from 'node:http';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { Logger } from '../lib/logger';
import { createId } from '../lib/ids';
import { clientMessageSchema } from '../schemas/events.schema';
import type { ServerMessage } from '../types/events';
import type { RealtimePublisher } from './publisher';

interface ClientState {
  readonly clientId: string;
  /** `null` means "all gates". */
  gateFilter: string | null;
}

/** Message types that carry a `gateId` and are therefore filterable. */
function messageGateId(message: ServerMessage): string | null {
  switch (message.type) {
    case 'ACCESS_EVENT':
      return message.payload.gateId;
    case 'GATE_STATUS':
      return message.payload.gateId;
    case 'WELCOME':
    case 'INVITATION_EVENT':
      return null;
  }
}

export class WebSocketRealtimeHub implements RealtimePublisher {
  private wss: WebSocketServer | null = null;
  private readonly clients = new Map<WebSocket, ClientState>();

  public constructor(private readonly logger: Logger) {}

  /** Bind to an existing HTTP server and begin accepting connections. */
  public attach(server: Server): void {
    const wss = new WebSocketServer({ server, path: '/realtime' });
    this.wss = wss;

    wss.on('connection', (socket: WebSocket) => this.handleConnection(socket));
    wss.on('error', (error: Error) => {
      this.logger.error('WebSocket server error', { error });
    });

    this.logger.info('Realtime WebSocket hub attached', { path: '/realtime' });
  }

  public publish(message: ServerMessage): void {
    const serialised = JSON.stringify(message);
    const targetGateId = messageGateId(message);

    for (const [socket, state] of this.clients) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      if (
        targetGateId !== null &&
        state.gateFilter !== null &&
        state.gateFilter !== targetGateId
      ) {
        continue;
      }
      socket.send(serialised);
    }
  }

  /** Number of currently-connected realtime clients (useful for metrics/health). */
  public connectionCount(): number {
    return this.clients.size;
  }

  public async close(): Promise<void> {
    const wss = this.wss;
    if (wss === null) {
      return;
    }
    for (const socket of this.clients.keys()) {
      socket.close(1001, 'server shutting down');
    }
    this.clients.clear();
    await new Promise<void>((resolve, reject) => {
      wss.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.wss = null;
  }

  private handleConnection(socket: WebSocket): void {
    const state: ClientState = { clientId: createId('ws'), gateFilter: null };
    this.clients.set(socket, state);
    this.logger.debug('Realtime client connected', { clientId: state.clientId });

    this.send(socket, {
      type: 'WELCOME',
      payload: {
        clientId: state.clientId,
        serverTime: new Date().toISOString(),
        protocol: 'gatekeeper.v1',
      },
    });

    socket.on('message', (data: RawData) => this.handleMessage(socket, state, data));
    socket.on('close', () => {
      this.clients.delete(socket);
      this.logger.debug('Realtime client disconnected', { clientId: state.clientId });
    });
    socket.on('error', (error: Error) => {
      this.logger.warn('Realtime client error', { clientId: state.clientId, error });
    });
  }

  private handleMessage(socket: WebSocket, state: ClientState, data: RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      this.logger.warn('Discarded non-JSON realtime frame', { clientId: state.clientId });
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn('Discarded invalid realtime frame', {
        clientId: state.clientId,
      });
      return;
    }

    switch (result.data.type) {
      case 'SUBSCRIBE':
        state.gateFilter = result.data.payload.gateId;
        this.logger.debug('Realtime subscription updated', {
          clientId: state.clientId,
          gateFilter: state.gateFilter,
        });
        break;
      case 'PING':
        this.send(socket, {
          type: 'PONG',
          payload: { timestamp: new Date().toISOString() },
        });
        break;
    }
  }

  private send(socket: WebSocket, message: ServerMessage | { type: 'PONG'; payload: { timestamp: string } }): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }
}
