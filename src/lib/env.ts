/**
 * Environment loading + validation.
 *
 * Configuration is parsed once, at process start, through Zod. If a value is
 * missing or malformed the process refuses to boot rather than failing at some
 * unpredictable point later. Downstream modules receive a fully-typed,
 * frozen `AppConfig`.
 */

import 'dotenv/config';
import { z } from 'zod';

/** Raw environment shape, exactly as it comes off `process.env`. */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  GATE_IDS: z
    .string()
    .default('GATE-NORTH,GATE-SOUTH,GATE-VISITOR,GATE-SERVICE'),

  DEFAULT_INVITATION_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  DEFAULT_INVITATION_MAX_USES: z.coerce.number().int().positive().default(1),

  SIMULATOR_BASE_URL: z.string().url().default('http://localhost:4000'),
  SIMULATOR_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
});

/** Validated, application-friendly configuration. */
export interface AppConfig {
  readonly port: number;
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly isProduction: boolean;
  readonly gateIds: readonly string[];
  readonly defaultInvitationTtlMinutes: number;
  readonly defaultInvitationMaxUses: number;
  readonly simulator: {
    readonly baseUrl: string;
    readonly intervalMs: number;
  };
}

/**
 * Parse an environment bag into an {@link AppConfig}.
 * Exported separately from the singleton so tests can inject fixtures.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const raw = parsed.data;

  return Object.freeze({
    port: raw.PORT,
    nodeEnv: raw.NODE_ENV,
    isProduction: raw.NODE_ENV === 'production',
    gateIds: Object.freeze(
      raw.GATE_IDS.split(',')
        .map((gateId) => gateId.trim())
        .filter((gateId) => gateId.length > 0),
    ),
    defaultInvitationTtlMinutes: raw.DEFAULT_INVITATION_TTL_MINUTES,
    defaultInvitationMaxUses: raw.DEFAULT_INVITATION_MAX_USES,
    simulator: Object.freeze({
      baseUrl: raw.SIMULATOR_BASE_URL,
      intervalMs: raw.SIMULATOR_INTERVAL_MS,
    }),
  });
}

/** The process-wide configuration singleton. */
export const config: AppConfig = loadConfig();
