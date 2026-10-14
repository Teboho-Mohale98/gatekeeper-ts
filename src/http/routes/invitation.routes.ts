/**
 * Visitor invitation routes.
 *
 *   POST /api/invitations          - create a pre-clearance code
 *   GET  /api/invitations          - list invitations (POPIA-masked projection)
 *   POST /api/invitations/:id/revoke - revoke an invitation early
 */

import { Router } from 'express';
import type { AppContainer } from '../../container';
import { createInvitationSchema } from '../../schemas/invitation.schema';
import type {
  CreateInvitationResponse,
  PublicInvitation,
} from '../../types/api';
import { asyncHandler } from '../middleware/async-handler';
import { requireParam } from '../request-helpers';

interface InvitationListResponse {
  count: number;
  invitations: readonly PublicInvitation[];
}

interface RevokeInvitationResponse {
  invitation: PublicInvitation;
}

export function createInvitationRouter(container: AppContainer): Router {
  const router = Router();
  const { visitorService } = container;

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = createInvitationSchema.parse(req.body);
      const invitation = visitorService.createInvitation(input);
      const body: CreateInvitationResponse = {
        invitation: visitorService.toPublic(invitation),
      };
      res.status(201).json(body);
    }),
  );

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const invitations = visitorService
        .list()
        .map((invitation) => visitorService.toPublic(invitation));
      const body: InvitationListResponse = {
        count: invitations.length,
        invitations,
      };
      res.status(200).json(body);
    }),
  );

  router.post(
    '/:id/revoke',
    asyncHandler(async (req, res) => {
      const id = requireParam(req, 'id');
      const invitation = visitorService.revoke(id);
      const body: RevokeInvitationResponse = {
        invitation: visitorService.toPublic(invitation),
      };
      res.status(200).json(body);
    }),
  );

  return router;
}
