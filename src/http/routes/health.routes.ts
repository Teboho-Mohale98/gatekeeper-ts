/**
 * Liveness/readiness probe.
 *
 *   GET /health
 */

import { Router } from 'express';
import type { AppContainer } from '../../container';
import type { HealthResponse } from '../../types/api';

export function createHealthRouter(container: AppContainer): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      gateCount: container.gateRegistry.count(),
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(body);
  });

  return router;
}
