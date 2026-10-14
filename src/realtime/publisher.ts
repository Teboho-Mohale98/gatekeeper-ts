/**
 * The transport-agnostic publishing port.
 *
 * Services (access engine, visitor service, gate registry) depend on this thin
 * interface rather than on `ws`. That keeps the domain testable with a simple
 * in-memory fake and leaves the door open for a Redis pub/sub fan-out later.
 */

import type { ServerMessage } from '../types/events';

export interface RealtimePublisher {
  publish(message: ServerMessage): void;
}

/** Silent publisher used in tests and when realtime is disabled. */
export class NoopRealtimePublisher implements RealtimePublisher {
  public publish(_message: ServerMessage): void {
    // Intentionally does nothing.
  }
}
