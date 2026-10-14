/**
 * Composition root.
 *
 * The only place where concrete implementations are chosen and wired together.
 * Every other module depends on interfaces, which is what makes the domain
 * testable and the persistence/transport layers swappable.
 */

import type { AppConfig } from './lib/env';
import type { Logger } from './lib/logger';
import { WebSocketRealtimeHub } from './realtime/websocket-hub';
import type { RealtimePublisher } from './realtime/publisher';
import {
  InMemoryAccessLogRepository,
  type AccessLogRepository,
} from './repositories/access-log.repository';
import {
  InMemoryInvitationRepository,
  type InvitationRepository,
} from './repositories/invitation.repository';
import { AccessValidationService } from './services/access-validation.service';
import { GateRegistry } from './services/gate-registry.service';
import { VisitorService } from './services/visitor.service';

/** Everything the HTTP and realtime layers need, resolved once at boot. */
export interface AppContainer {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly publisher: RealtimePublisher;
  readonly realtimeHub: WebSocketRealtimeHub;
  readonly invitationRepository: InvitationRepository;
  readonly accessLogRepository: AccessLogRepository;
  readonly gateRegistry: GateRegistry;
  readonly visitorService: VisitorService;
  readonly accessService: AccessValidationService;
}

export function createContainer(config: AppConfig, logger: Logger): AppContainer {
  const realtimeHub = new WebSocketRealtimeHub(logger.child('realtime'));
  const publisher: RealtimePublisher = realtimeHub;

  const invitationRepository = new InMemoryInvitationRepository();
  const accessLogRepository = new InMemoryAccessLogRepository();

  const gateRegistry = new GateRegistry(config.gateIds, publisher, logger.child('gates'));
  const visitorService = new VisitorService(
    invitationRepository,
    publisher,
    config,
    logger.child('visitors'),
  );
  const accessService = new AccessValidationService(
    invitationRepository,
    accessLogRepository,
    gateRegistry,
    visitorService,
    publisher,
    logger.child('access'),
  );

  return {
    config,
    logger,
    publisher,
    realtimeHub,
    invitationRepository,
    accessLogRepository,
    gateRegistry,
    visitorService,
    accessService,
  };
}
