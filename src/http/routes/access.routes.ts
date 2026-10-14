/**
 * Access verification route.
 *
 *   POST /api/access/verify - simulate a gate reader scanning a credential.
 *
 * A denied request is still an HTTP 200: the *transport* succeeded, and the
 * decision (granted/denied) is part of the payload. Reserved for genuine
 * transport/validation failures are 4xx/5xx.
 */

import { Router } from 'express';
import type { AppContainer } from '../../container';
import { verifyAccessSchema } from '../../schemas/access.schema';
import type { VerifyAccessResponse } from '../../types/api';
import { asyncHandler } from '../middleware/async-handler';

export function createAccessRouter(container: AppContainer): Router {
  const router = Router();
  const { accessService } = container;

  router.post(
    '/verify',
    asyncHandler(async (req, res) => {
      const input = verifyAccessSchema.parse(req.body);
      const evaluation = accessService.verify(input);
      const body: VerifyAccessResponse = {
        decision: evaluation.decision,
        gateStatus: evaluation.gateStatus,
        logId: evaluation.log.logId,
      };
      res.status(200).json(body);
    }),
  );

  return router;
}
