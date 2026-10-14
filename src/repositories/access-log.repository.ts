/**
 * Append-only audit-log persistence contract + in-memory implementation.
 *
 * Logs are stored in insertion order and filtered on read. The in-memory
 * implementation is bounded by a ring buffer so a runaway simulator cannot
 * exhaust memory - a real deployment would page records to cold storage.
 */

import type { AccessLog, AccessMethod, AccessResultStatus } from '../types/domain';

/** Criteria accepted by {@link AccessLogRepository.query}. */
export interface AccessLogFilter {
  readonly gateId?: string | undefined;
  readonly status?: AccessResultStatus | undefined;
  readonly accessMethod?: AccessMethod | undefined;
  readonly residentUnit?: string | undefined;
  /** Inclusive ISO-8601 lower bound (lexicographic compare). */
  readonly from?: string | undefined;
  /** Inclusive ISO-8601 upper bound (lexicographic compare). */
  readonly to?: string | undefined;
  readonly limit: number;
}

export interface AccessLogRepository {
  append(log: AccessLog): AccessLog;
  /** Newest-first, filtered, capped at `filter.limit`. */
  query(filter: AccessLogFilter): readonly AccessLog[];
  /** Number of retained records matching `filter`, ignoring `limit`. */
  countMatches(filter: AccessLogFilter): number;
  /** Total number of retained records (ignoring filters). */
  size(): number;
}

const DEFAULT_CAPACITY = 5_000;

export class InMemoryAccessLogRepository implements AccessLogRepository {
  private readonly buffer: AccessLog[] = [];

  public constructor(private readonly capacity: number = DEFAULT_CAPACITY) {}

  public append(log: AccessLog): AccessLog {
    this.buffer.push(log);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
    return log;
  }

  public query(filter: AccessLogFilter): readonly AccessLog[] {
    const matches = this.buffer.filter((log) => this.matches(log, filter));
    // Newest first, then apply the caller's window.
    matches.reverse();
    return matches.slice(0, filter.limit);
  }

  public countMatches(filter: AccessLogFilter): number {
    return this.buffer.reduce(
      (total, log) => (this.matches(log, filter) ? total + 1 : total),
      0,
    );
  }

  public size(): number {
    return this.buffer.length;
  }

  private matches(log: AccessLog, filter: AccessLogFilter): boolean {
    if (filter.gateId !== undefined && log.gateId !== filter.gateId) {
      return false;
    }
    if (filter.status !== undefined && log.status !== filter.status) {
      return false;
    }
    if (filter.accessMethod !== undefined && log.accessMethod !== filter.accessMethod) {
      return false;
    }
    if (filter.residentUnit !== undefined && log.residentUnit !== filter.residentUnit) {
      return false;
    }
    if (filter.from !== undefined && log.timestamp < filter.from) {
      return false;
    }
    if (filter.to !== undefined && log.timestamp > filter.to) {
      return false;
    }
    return true;
  }
}
