/**
 * Validation schemas for the access-verification endpoint.
 *
 * The request body is modelled as a discriminated union on `accessMethod`,
 * mirroring `PresentedCredential`. This means a `LICENSE_PLATE` request that
 * accidentally ships an `accessCode` is rejected outright, and - importantly -
 * the parsed type carries only the field the reader actually produced.
 */

import { z } from 'zod';
import { identifierSchema } from './common.schema';

const gateIdSchema = identifierSchema;

export const verifyAccessSchema = z.discriminatedUnion('accessMethod', [
  z
    .object({
      gateId: gateIdSchema,
      accessMethod: z.literal('PIN_CODE'),
      accessCode: z.string().trim().regex(/^[0-9]{4,10}$/, 'accessCode must be 4-10 digits'),
    })
    .strict(),
  z
    .object({
      gateId: gateIdSchema,
      accessMethod: z.literal('LICENSE_PLATE'),
      licensePlate: z.string().trim().min(2).max(16),
    })
    .strict(),
  z
    .object({
      gateId: gateIdSchema,
      accessMethod: z.literal('BLUETOOTH'),
      deviceToken: z.string().trim().min(8).max(128),
    })
    .strict(),
  z
    .object({
      gateId: gateIdSchema,
      accessMethod: z.literal('FACIAL_RECOGNITION'),
      faceTemplateId: z.string().trim().min(4).max(128),
    })
    .strict(),
  z
    .object({
      gateId: gateIdSchema,
      accessMethod: z.literal('BIOMETRIC_READER'),
      biometricHash: z.string().trim().min(4).max(256),
    })
    .strict(),
]);

export type VerifyAccessInput = z.infer<typeof verifyAccessSchema>;
