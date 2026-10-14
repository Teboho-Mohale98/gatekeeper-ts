/**
 * Hardware simulator.
 *
 * Standalone script that drives the platform the way real estate hardware
 * would: it seeds a handful of visitor invitations, then continuously presents
 * a realistic mix of valid and invalid credentials at random gates. It also
 * subscribes to the realtime channel so you can watch events arrive on the
 * WebSocket exactly as a dashboard would.
 *
 * Usage:
 *   npm run simulate                 # runs until Ctrl+C
 *   npm run simulate -- --cycles=5   # runs five scan cycles then exits
 *   npm run simulate -- --once       # single cycle (useful in CI/smoke tests)
 *
 * Requires the API to already be running (`npm run dev` or `npm start`).
 */

import { randomInt } from 'node:crypto';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { config } from './lib/env';
import { serverMessageSchema } from './schemas/events.schema';
import type { AccessMethod } from './types/domain';

/* -------------------------------------------------------------------------- */
/* Console helpers                                                            */
/* -------------------------------------------------------------------------- */

const ANSI = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  grey: '\x1b[90m',
} as const;

function stamp(): string {
  return `${ANSI.grey}${new Date().toISOString()}${ANSI.reset}`;
}

function info(message: string): void {
  process.stdout.write(`${stamp()} ${ANSI.cyan}[sim]${ANSI.reset} ${message}\n`);
}

function granted(message: string): void {
  process.stdout.write(`${stamp()} ${ANSI.green}[GRANTED]${ANSI.reset} ${message}\n`);
}

function denied(message: string): void {
  process.stdout.write(`${stamp()} ${ANSI.red}[DENIED ]${ANSI.reset} ${message}\n`);
}

function warn(message: string): void {
  process.stdout.write(`${stamp()} ${ANSI.yellow}[warn]${ANSI.reset} ${message}\n`);
}

/* -------------------------------------------------------------------------- */
/* Wire schemas (what the API promises to return)                             */
/* -------------------------------------------------------------------------- */

const invitationResponseSchema = z.object({
  invitation: z.object({
    id: z.string(),
    accessCode: z.string(),
    licensePlate: z.string(),
    residentUnit: z.string(),
  }),
});

const verifyResponseSchema = z.object({
  decision: z.object({
    granted: z.boolean(),
    gateId: z.string(),
    accessMethod: z.string(),
    rejectionReason: z.string().nullable(),
    detail: z.string(),
    residentUnit: z.string().nullable(),
  }),
  gateStatus: z.string(),
});

/* -------------------------------------------------------------------------- */
/* Seed data                                                                  */
/* -------------------------------------------------------------------------- */

interface SeedSpec {
  residentUnit: string;
  visitorName: string;
  licensePlate: string;
  visitorIdNumber: string;
  phoneNumber?: string;
  allowedMethods?: readonly AccessMethod[];
  maxUses?: number;
  ttlMinutes?: number;
}

interface SeededInvitation {
  readonly id: string;
  readonly accessCode: string;
  readonly licensePlate: string;
  readonly residentUnit: string;
}

const SEED_SPECS: readonly SeedSpec[] = [
  {
    residentUnit: 'BLOCK-A-10',
    visitorName: 'Naledi Mokoena',
    licensePlate: 'CA 123 456',
    visitorIdNumber: '9001015800083',
    phoneNumber: '+27 82 123 4567',
    allowedMethods: ['PIN_CODE', 'LICENSE_PLATE'],
    maxUses: 3,
    ttlMinutes: 120,
  },
  {
    residentUnit: 'BLOCK-B-04',
    visitorName: 'Sipho Dlamini',
    licensePlate: 'JHB 448 GP',
    visitorIdNumber: '8802295609081',
    allowedMethods: ['LICENSE_PLATE'],
    maxUses: 1,
    ttlMinutes: 30,
  },
  {
    residentUnit: 'THE-ESTATE-77',
    visitorName: 'Anele Khumalo',
    licensePlate: 'ND 884 221',
    visitorIdNumber: '9507124800182',
    phoneNumber: '+27 71 998 2210',
    allowedMethods: ['PIN_CODE'],
    maxUses: 5,
    ttlMinutes: 240,
  },
];

/* -------------------------------------------------------------------------- */
/* Small utilities                                                            */
/* -------------------------------------------------------------------------- */

type Attempt = Readonly<Record<string, unknown>>;

function pick<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error('pick() called with an empty list');
  }
  return items[randomInt(0, items.length)]!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randomDigits(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String(randomInt(0, 10));
  }
  return out;
}

function randomPlate(): string {
  const letters = 'ABCDEFGHJKLMNPRSTVWXYZ';
  let out = '';
  for (let i = 0; i < 3; i += 1) {
    out += letters[randomInt(0, letters.length)];
  }
  return `${out} ${randomDigits(3)} ${randomDigits(3)}`;
}

/* -------------------------------------------------------------------------- */
/* API interaction                                                            */
/* -------------------------------------------------------------------------- */

const baseUrl = config.simulator.baseUrl;
const gateIds = config.gateIds.length > 0 ? config.gateIds : ['GATE-NORTH'];

async function seedInvitations(): Promise<readonly SeededInvitation[]> {
  info(`Seeding ${SEED_SPECS.length} invitations against ${baseUrl} ...`);
  const seeded: SeededInvitation[] = [];

  for (const spec of SEED_SPECS) {
    const response = await fetch(`${baseUrl}/api/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(spec),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to seed invitation for ${spec.visitorName}: ${response.status} ${await response.text()}`,
      );
    }

    const parsed = invitationResponseSchema.parse(await response.json());
    seeded.push(parsed.invitation);
    info(
      `Seeded invite for ${parsed.invitation.residentUnit} ` +
        `(code ${parsed.invitation.accessCode})`,
    );
  }

  return seeded;
}

/** Build a single, weighted access attempt: mostly valid, deliberately not always. */
function buildAttempt(seeds: readonly SeededInvitation[]): Attempt {
  const gateId = pick(gateIds);
  const roll = randomInt(0, 100);

  // ~65%: a genuine, currently-valid credential.
  if (roll < 65 && seeds.length > 0) {
    const seed = pick(seeds);
    if (randomInt(0, 2) === 0) {
      return { gateId, accessMethod: 'PIN_CODE', accessCode: seed.accessCode };
    }
    return { gateId, accessMethod: 'LICENSE_PLATE', licensePlate: seed.licensePlate };
  }

  // ~15%: an unknown PIN.
  if (roll < 80) {
    return { gateId, accessMethod: 'PIN_CODE', accessCode: randomDigits(6) };
  }

  // ~12%: an unknown license plate ("wrong car at the boom").
  if (roll < 92) {
    return { gateId, accessMethod: 'LICENSE_PLATE', licensePlate: randomPlate() };
  }

  // ~8%: exercise the alternate readers (Bluetooth / face / biometric).
  // These are valid requests that this reference engine declines, which keeps
  // the deny-path and audit trail well covered.
  const method = pick<AccessMethod>([
    'BLUETOOTH',
    'FACIAL_RECOGNITION',
    'BIOMETRIC_READER',
  ]);

  switch (method) {
    case 'BLUETOOTH':
      return { gateId, accessMethod: method, deviceToken: randomDigits(16) };
    case 'FACIAL_RECOGNITION':
      return { gateId, accessMethod: method, faceTemplateId: `face-${randomDigits(8)}` };
    case 'BIOMETRIC_READER':
      return { gateId, accessMethod: method, biometricHash: randomDigits(24) };
    case 'PIN_CODE':
    case 'LICENSE_PLATE':
      // Unreachable given the array above, but keeps the switch exhaustive.
      return { gateId, accessMethod: 'PIN_CODE', accessCode: randomDigits(6) };
  }
}

interface Tally {
  granted: number;
  denied: number;
  errors: number;
}

async function scan(attempt: Attempt, tally: Tally): Promise<void> {
  try {
    const response = await fetch(`${baseUrl}/api/access/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(attempt),
    });

    if (!response.ok) {
      tally.errors += 1;
      warn(`verify returned HTTP ${response.status}: ${await response.text()}`);
      return;
    }

    const parsed = verifyResponseSchema.parse(await response.json());
    const { decision } = parsed;

    if (decision.granted) {
      tally.granted += 1;
      granted(
        `${decision.gateId} ${decision.accessMethod} unit=${decision.residentUnit ?? '-'}`,
      );
    } else {
      tally.denied += 1;
      denied(
        `${decision.gateId} ${decision.accessMethod} reason=${decision.rejectionReason ?? 'UNKNOWN'}`,
      );
    }
  } catch (error: unknown) {
    tally.errors += 1;
    warn(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Realtime subscription                                                      */
/* -------------------------------------------------------------------------- */

function startRealtimeClient(): WebSocket {
  const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/realtime`;
  const socket = new WebSocket(wsUrl);

  socket.on('open', () => {
    info(`Realtime connected: ${wsUrl}`);
    socket.send(JSON.stringify({ type: 'SUBSCRIBE', payload: { gateId: null } }));
  });

  socket.on('message', (data: Buffer) => {
    let json: unknown;
    try {
      json = JSON.parse(data.toString());
    } catch {
      return;
    }
    const parsed = serverMessageSchema.safeParse(json);
    if (!parsed.success) {
      return;
    }

    const message = parsed.data;
    switch (message.type) {
      case 'WELCOME':
        info(`Welcome (clientId=${message.payload.clientId})`);
        break;
      case 'INVITATION_EVENT':
        info(
          `invitation ${message.payload.action} ${message.payload.visitorName} ` +
            `(${message.payload.residentUnit})`,
        );
        break;
      case 'GATE_STATUS':
        info(
          `gate ${message.payload.gateId} ${message.payload.previous} -> ${message.payload.current}`,
        );
        break;
      case 'ACCESS_EVENT':
        // Access events are already logged from the HTTP response, so we only
        // surface the realtime copy to prove the broadcast works end-to-end.
        info(
          `ws: ${message.payload.granted ? 'GRANT' : 'DENY'} ${message.payload.gateId} ` +
            `${message.payload.accessMethod}`,
        );
        break;
    }
  });

  socket.on('error', (error: Error) => {
    warn(`Realtime socket error: ${error.message}`);
  });

  return socket;
}

/* -------------------------------------------------------------------------- */
/* Main loop                                                                  */
/* -------------------------------------------------------------------------- */

function parseCycles(argv: readonly string[]): number {
  if (argv.includes('--once')) {
    return 1;
  }
  const arg = argv.find((value) => value.startsWith('--cycles='));
  if (arg === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const parsed = Number(arg.slice('--cycles='.length));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

async function main(): Promise<void> {
  const cycles = parseCycles(process.argv.slice(2));
  const tally: Tally = { granted: 0, denied: 0, errors: 0 };

  let seeds: readonly SeededInvitation[] = [];
  try {
    seeds = await seedInvitations();
  } catch (error: unknown) {
    warn(
      `Could not seed invitations (is the API running at ${baseUrl}?): ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const socket = startRealtimeClient();
  info(
    `Bombarding ${baseUrl}/api/access/verify every ${config.simulator.intervalMs}ms ` +
      `(press Ctrl+C to stop)`,
  );

  let running = true;
  const stop = (signal: NodeJS.Signals): void => {
    if (!running) {
      return;
    }
    running = false;
    info(`Received ${signal}, finishing up ...`);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  let cycle = 0;
  while (running && cycle < cycles) {
    cycle += 1;
    const burst = randomInt(1, 4);
    for (let i = 0; i < burst && running; i += 1) {
      await scan(buildAttempt(seeds), tally);
      await sleep(150);
    }
    info(
      `cycle ${cycle} done - granted=${tally.granted} denied=${tally.denied} errors=${tally.errors}`,
    );
    if (cycle >= cycles) {
      break;
    }
    await sleep(config.simulator.intervalMs);
  }

  socket.close();
  process.stdout.write(
    `\n${stamp()} ${ANSI.cyan}[sim]${ANSI.reset} Summary: ` +
      `${ANSI.green}${tally.granted} granted${ANSI.reset}, ` +
      `${ANSI.red}${tally.denied} denied${ANSI.reset}, ` +
      `${ANSI.yellow}${tally.errors} errors${ANSI.reset}\n`,
  );
}

void main();
