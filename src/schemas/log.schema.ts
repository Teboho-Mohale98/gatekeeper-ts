/**
 * Validation schemas for the audit-log query endpoint.
 *
 * Query-string values always arrive as strings, so numeric/enum coercions are
 * applied here rather than in the route handler.
 */

import { z } from 'zod';
import { accessResultStatusSchema, accessMethodSchema } from './common.schema';

export const accessLogQuerySchema = z
  .object({
    gateId: z.string().trim().min(1).max(64).optional(),
    status: accessResultStatusSchema.optional(),
    accessMethod: accessMethodSchema.optional(),
    residentUnit: z.string().trim().min(1).max(40).optional(),
    /** Inclusive ISO-8601 lower bound. */
    from: z.string().datetime({ offset: true }).optional(),
    /** Inclusive ISO-8601 upper bound. */
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(50),
  })
  .strict();

export type AccessLogQueryInput = z.infer<typeof accessLogQuerySchema>;
