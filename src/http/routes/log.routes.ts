/**
 * Audit-log routes.
 *
 *   GET /api/logs - recent access logs with optional filtering.
 *
 * Every record returned here has already passed through the POPIA masker when it
 * was written; no raw identifiers are ever present.
 */

import { Router } from 'express';
import type { AppContainer } from '../../container';
import { accessLogQuerySchema } from '../../schemas/log.schema';
import type { AccessLogListResponse } from '../../types/api';
import { asyncHandler } from '../middleware/async-handler';

export function createAccessLogRouter(container: AppContainer): Router {
  const router = Router();
  const { accessLogRepository } = container;

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const query = accessLogQuerySchema.parse(req.query);
      const logs = accessLogRepository.query(query);
      const body: AccessLogListResponse = {
        total: accessLogRepository.countMatches(query),
        count: logs.length,
        limit: query.limit,
        logs,
      };
      res.status(200).json(body);
    }),
  );

  return router;
}
