/**
 * Validation schemas for visitor invitations.
 */

import { z } from 'zod';
import { ACCESS_METHODS } from '../types/domain';
import { accessMethodSchema } from './common.schema';

/** South African ID number: exactly 13 digits. */
const saIdNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{13}$/, 'visitorIdNumber must be exactly 13 digits');

/** Loose E.164-ish phone number: optional `+`, digits, spaces and hyphens. */
const phoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{7,18}$/, 'phoneNumber must be a valid phone number');

/**
 * Body for `POST /api/invitations`.
 * `.strict()` rejects unknown keys so clients cannot smuggle unexpected fields
 * into the persisted invitation.
 */
export const createInvitationSchema = z
  .object({
    residentUnit: z.string().trim().min(1).max(40),
    visitorName: z.string().trim().min(2).max(120),
    licensePlate: z.string().trim().min(2).max(16),
    visitorIdNumber: saIdNumberSchema,
    phoneNumber: phoneNumberSchema.optional(),
    allowedMethods: z
      .array(accessMethodSchema)
      .min(1)
      .max(ACCESS_METHODS.length)
      .optional(),
    ttlMinutes: z.number().int().min(1).max(60 * 24 * 30).optional(),
    maxUses: z.number().int().min(1).max(1000).optional(),
  })
  .strict();

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
