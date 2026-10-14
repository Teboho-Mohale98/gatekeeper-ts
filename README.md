# GateKeeper TS

> A smart access control and estate security platform — a fully-typed TypeScript
> backend service plus a mock hardware simulation engine, inspired by
> ClickOn (Bidvest) visitor and gate management.

GateKeeper TS models the full lifecycle of a modern gated estate: residents issue
time- and usage-bound visitor pre-clearance codes, physical gate readers present
credentials, a rule engine decides **grant / deny**, and every decision is
streamed in real time over WebSockets while being written to a POPIA-compliant
audit trail.

This is a portfolio-grade reference implementation: **strict TypeScript with zero
`any`**, Zod-validated boundaries, clean layered architecture, and an
end-to-end simulator you can watch drive the system.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict%20%2B%20no--any-3178c6)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D20.6-3c873a)](https://nodejs.org/)
[![Zod](https://img.shields.io/badge/validation-Zod-3068c6)](https://zod.dev/)
[![WebSockets](https://img.shields.io/badge/realtime-WebSockets-35d07f)](#realtime-protocol)
[![POPIA](https://img.shields.io/badge/compliance-POPIA-1f8f56)](#popia-compliance)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Live showcase:** https://gatekeeper-ts.vercel.app · **API service:** https://gatekeeper-ts.onrender.com

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Folder structure](#folder-structure)
4. [Getting started](#getting-started)
5. [API reference](#api-reference)
6. [Realtime protocol](#realtime-protocol)
7. [The access validation engine](#the-access-validation-engine)
8. [POPIA compliance](#popia-compliance)
9. [Architecture decisions](#architecture-decisions)
10. [Why this architecture fits ClickOn's domain](#why-this-architecture-fits-clickons-domain)
11. [Scripts](#scripts)
12. [Deployment](#deployment)
13. [Roadmap / production hardening](#roadmap--production-hardening)

---

## Features

- **Visitor invitations** — cryptographically random 6-digit access codes,
  configurable TTL and usage limits, per-method permissions, revocation.
- **Access validation engine** — an ordered, exhaustive rule chain producing
  immutable, machine-readable decisions (`SUCCESS` / `FAILED` plus a precise
  `RejectionReason`).
- **Multiple credential types** — `PIN_CODE`, `LICENSE_PLATE`, `BLUETOOTH`,
  `FACIAL_RECOGNITION`, `BIOMETRIC_READER`, modelled as a discriminated union.
- **Real-time broadcast** — a typed WebSocket protocol (built on `ws`) emits
  access events, invitation lifecycle events, and gate status transitions.
- **POPIA compliance utility** — every persisted audit record is masked
  (ID numbers, phone numbers, plates, codes) before it is written.
- **Hardware simulator** — a standalone script that seeds data and bombards the
  API with a realistic mix of valid and invalid scans on a timer.
- **Strict typing** — `strict`, `noImplicitAny`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `noImplicitReturns`, `noUnusedLocals/Parameters`.
- **Zero `any`** — enforced by both the compiler and an ESLint rule.

---

## Tech stack

| Concern      | Choice                                   | Why |
| ------------ | ---------------------------------------- | --- |
| Language     | TypeScript 5 (strict)                    | Compile-time safety for a security domain. |
| Runtime      | Node.js (>= 20.6) + Express 4            | Ubiquitous, minimal, well understood. |
| Validation   | Zod                                      | One schema drives runtime checks **and** inferred types. |
| Realtime     | `ws`                                     | Lightweight; lets us own a Zod-validated frame protocol. |
| Config       | `dotenv` + Zod                           | Fail-fast, typed configuration at boot. |
| Dev runner   | `tsx`                                    | Fast TS execution with watch mode, no build step. |
| Lint         | ESLint 9 + typescript-eslint             | Enforces the `any`-free, no-unused-vars contract. |

No ORM, no DI framework, no logging framework — deliberate choices that keep the
domain logic front and centre. Each dependency lives behind an interface.

---

## Folder structure

```
gatekeeper-ts/
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── server.ts                     # process entry point + graceful shutdown
    ├── container.ts                  # composition root (the only wiring site)
    ├── simulator.ts                  # standalone hardware simulator
    │
    ├── types/                        # domain vocabulary (single source of truth)
    │   ├── domain.ts                 # AccessMethod, GateStatus, VisitorInvitation, AccessLog…
    │   ├── api.ts                    # HTTP request/response contracts
    │   └── events.ts                 # realtime message unions
    │
    ├── schemas/                      # Zod runtime validation
    │   ├── common.schema.ts          # shared enums & primitives
    │   ├── invitation.schema.ts
    │   ├── access.schema.ts
    │   ├── log.schema.ts
    │   └── events.schema.ts
    │
    ├── lib/                          # pure, framework-free utilities
    │   ├── env.ts                    # Zod-validated configuration
    │   ├── logger.ts                 # structured JSON logger
    │   ├── errors.ts                 # AppError hierarchy + rejection messages
    │   ├── ids.ts                    # CSPRNG ids & access codes
    │   ├── text.ts                   # credential normalisation
    │   └── popia.ts                  # POPIA masking utilities
    │
    ├── repositories/                 # persistence ports + in-memory adapters
    │   ├── invitation.repository.ts
    │   └── access-log.repository.ts
    │
    ├── services/                     # business logic
    │   ├── gate-registry.service.ts  # hardware state machine + heartbeats
    │   ├── visitor.service.ts        # invitation lifecycle
    │   └── access-validation.service.ts  # the rule engine
    │
    ├── realtime/
    │   ├── publisher.ts              # transport-agnostic publishing port
    │   └── websocket-hub.ts          # `ws` fan-out implementation
    │
    └── http/
        ├── app.ts                    # Express app factory
        ├── request-helpers.ts
        ├── middleware/
        │   ├── async-handler.ts
        │   ├── cors.ts
        │   ├── error-handler.ts
        │   └── not-found.ts
        └── routes/
            ├── invitation.routes.ts
            ├── access.routes.ts
            ├── log.routes.ts
            └── health.routes.ts
```

---

## Getting started

### Prerequisites

- Node.js **>= 20.6** (uses built-in `fetch` and `crypto.randomUUID`)
- npm 9+

### Install & configure

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
```

### Run

```bash
# Development (watch mode)
npm run dev

# Production build + run
npm run build
npm start
```

The API listens on `http://localhost:4000` and the realtime channel on
`ws://localhost:4000/realtime`.

### Try it out

In a second terminal, run the hardware simulator:

```bash
npm run simulate                 # runs until Ctrl+C
npm run simulate -- --cycles=5   # five scan cycles, then exit
npm run simulate -- --once       # a single cycle (CI-friendly smoke test)
```

You will see invitations being seeded, then a stream of grant/deny decisions
plus the realtime copies arriving over the WebSocket.

---

## API reference

All request bodies are validated with Zod. Errors use a single envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [] } }
```

### `POST /api/invitations`

Create a visitor pre-clearance code.

```jsonc
// request
{
  "residentUnit": "BLOCK-A-10",
  "visitorName": "Naledi Mokoena",
  "licensePlate": "CA 123 456",
  "visitorIdNumber": "9001015800083",
  "phoneNumber": "+27 82 123 4567",     // optional
  "allowedMethods": ["PIN_CODE", "LICENSE_PLATE"], // optional
  "ttlMinutes": 120,                     // optional (env default)
  "maxUses": 3                           // optional (env default)
}
```

```jsonc
// 201 response — POPIA-safe projection
{
  "invitation": {
    "id": "inv_…",
    "residentUnit": "BLOCK-A-10",
    "visitorName": "Naledi Mokoena",
    "licensePlate": "CA123456",
    "maskedIdNumber": "***********83",
    "maskedPhoneNumber": "**********67",
    "accessCode": "778436",
    "allowedMethods": ["PIN_CODE", "LICENSE_PLATE"],
    "expiresAt": "2026-10-14T12:12:43.000Z",
    "maxUses": 3,
    "currentUses": 0,
    "status": "ACTIVE"
  }
}
```

### `POST /api/access/verify`

Simulate a gate reader scanning a credential. A denied access is still an
**HTTP 200** — the transport succeeded; the decision is the payload.

```jsonc
// request — discriminated on accessMethod
{ "gateId": "GATE-NORTH", "accessMethod": "PIN_CODE", "accessCode": "778436" }
{ "gateId": "GATE-SOUTH", "accessMethod": "LICENSE_PLATE", "licensePlate": "CA 123 456" }
{ "gateId": "GATE-VISITOR", "accessMethod": "BLUETOOTH", "deviceToken": "…" }
```

```jsonc
// 200 response
{
  "decision": {
    "decisionId": "dec_…",
    "timestamp": "2026-10-14T10:12:43.124Z",
    "gateId": "GATE-NORTH",
    "accessMethod": "PIN_CODE",
    "granted": true,
    "rejectionReason": null,
    "invitationId": "inv_…",
    "residentUnit": "BLOCK-A-10",
    "detail": "Access granted for Naledi M."
  },
  "gateStatus": "GRANTED",
  "logId": "log_…"
}
```

### `GET /api/logs`

Retrieve audit records (newest first, every field already POPIA-masked).

| Query param    | Type     | Notes                                   |
| -------------- | -------- | --------------------------------------- |
| `gateId`       | string   | Exact match                             |
| `status`       | enum     | `SUCCESS` \| `FAILED`                   |
| `accessMethod` | enum     | Any `AccessMethod`                      |
| `residentUnit` | string   | Exact match                             |
| `from` / `to`  | ISO-8601 | Inclusive time bounds                   |
| `limit`        | 1–500    | Defaults to 50                          |

```bash
curl "http://localhost:4000/api/logs?status=FAILED&limit=5"
```

### Supporting endpoints

- `GET /api/invitations` — list invitations (masked projection).
- `POST /api/invitations/:id/revoke` — revoke early.
- `GET /health` — liveness probe.

---

## Realtime protocol

Connect to `ws://localhost:4000/realtime`. The server greets you, then streams
typed envelopes. Both directions are discriminated unions.

**Client → server**

```jsonc
{ "type": "SUBSCRIBE", "payload": { "gateId": "GATE-NORTH" } } // null = all gates
{ "type": "PING",      "payload": { "timestamp": "2026-10-14T10:00:00.000Z" } }
```

**Server → client**

```jsonc
{ "type": "WELCOME",         "payload": { "clientId": "ws_…", "protocol": "gatekeeper.v1", … } }
{ "type": "ACCESS_EVENT",    "payload": { "granted": true, "gateId": "GATE-NORTH", "credentialPayload": "*****6", … } }
{ "type": "INVITATION_EVENT","payload": { "action": "CREATED", "invitationId": "inv_…", … } }
{ "type": "GATE_STATUS",     "payload": { "gateId": "GATE-NORTH", "previous": "IDLE", "current": "GRANTED", … } }
{ "type": "PONG",            "payload": { "timestamp": "…" } }
```

Inbound frames are validated with Zod before they can influence server state.

---

## The access validation engine

Every scan runs an ordered, deterministic chain. The **most specific** rejection
reason wins so operators get an actionable audit trail.

| # | Rule                                   | Rejection reason          |
| - | -------------------------------------- | ------------------------- |
| 1 | Gate exists and is online              | `GATE_OFFLINE`            |
| 2 | Credential resolves to an invitation   | `NO_MATCHING_INVITATION`  |
| 3 | Invitation is not revoked              | `INVITATION_REVOKED`      |
| 4 | Invitation has not expired             | `INVITATION_EXPIRED`      |
| 5 | Method is permitted                    | `METHOD_NOT_PERMITTED`    |
| 6 | Usage allowance not exhausted          | `USAGE_LIMIT_REACHED`     |
| 7 | Otherwise → **grant**, increment usage | —                         |

On grant the engine drives the gate state machine (`IDLE → PROCESSING →
GRANTED`), then auto-resets to `IDLE` after a short, non-blocking delay — the way
a physical boom would cycle.

---

## POPIA compliance

The **Protection of Personal Information Act (Act 4 of 2013)** requires personal
identifiers to be minimised and de-identified in retained records. `src/lib/popia.ts`
is the single choke-point every audit write passes through:

| Field          | Raw                          | Stored/displayed        |
| -------------- | ---------------------------- | ----------------------- |
| ID number      | `9001015800083`              | `***********83`         |
| Phone number   | `+27 82 123 4567`            | `**********67`          |
| License plate  | `CA 123 456`                 | `CA *** **6`            |
| Access code    | `778436`                     | `*****6`                |
| Name           | `Thandiwe Nkosi`             | `Thandiwe N.`           |

The raw ID number lives only in the in-memory invitation (owned by the resident);
it is **never** written to the access log. Realtime payloads are masked too.

---

## Architecture decisions

- **Layered, dependency-inverted design.** `types → lib → repositories/services →
  realtime/http`. A single composition root (`container.ts`) instantiates
  concretes and injects them as interfaces, so the domain never imports Express,
  `ws`, or a database.
- **One source of truth for vocabulary.** `types/domain.ts` exports `as const`
  tuples; Zod schemas and inferred types derive from them. Adding an access
  method is a one-line change that propagates everywhere and is exhaustively
  checked by `switch` statements.
- **Schema-first boundaries.** The wire contracts in `schemas/` are separate from
  the persistence and domain shapes, so an API version can evolve without
  disturbing storage.
- **Immutable decisions.** The engine returns an `AccessDecision` that is a
  value object; audit records are appended, never mutated.
- **The transport is a port.** Services publish through the `RealtimePublisher`
  interface, which makes broadcast trivially faked in tests and swappable for
  Redis pub/sub at scale.
- **`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`.** These turn
  subtle bugs (assigning `undefined` to an optional field, indexing past an
  array) into compile errors. The codebase is written to satisfy them without a
  single `!`-laden escape hatch beyond intentional, localised assertions.

---

## Why this architecture fits ClickOn's domain

ClickOn (Bidvest) operates at the intersection of **physical estate security**
and **software-defined access** — visitor pre-clearance, licence-plate and PIN
readers, boom gates, and resident-managed permissions across apartment blocks,
complexes and commercial parks. A few properties of that domain shaped every
decision here:

1. **Access is a decision, not a CRUD resource.** A gate scan is an event that
   must produce a fast, auditable verdict. Modelling the outcome as an immutable
   `AccessDecision` with an exhaustive `RejectionReason` mirrors how a security
   operations centre actually reasons: *why* was someone turned away? This is why
   the engine is a dedicated service rather than logic buried in a controller.

2. **Hardware is heterogeneous and unreliable.** Readers emit PINs, plates,
   Bluetooth tokens, face templates and biometric hashes. The
   `PresentedCredential` discriminated union — and the matching Zod
   discriminated union at the edge — let each reader ship exactly its own payload
   while the engine stays total. Gates fail; the `GateRegistry` state machine
   (`IDLE/PROCESSING/GRANTED/DENIED/OFFLINE`) models that reality instead of
   pretending every device is always available.

3. **Residents, not admins, issue access.** Visitor codes are created by
   residents and must be time-bound, use-bound and revocable — exactly the
   `VisitorInvitation` model. Random, non-sequential codes prevent enumeration,
   which is the difference between a secure estate and a guessable one.

4. **Security operations are real-time.** A control room wants events as they
   happen, not on refresh. The `RealtimePublisher` port and the typed WebSocket
   protocol deliver access and gate events instantly, while the same decision is
   independently persisted — the classic CQRS-style split between a hot event
   stream and a durable audit store.

5. **It operates under POPIA.** South African security operators process ID
   numbers, phone numbers and plates. Baking masking into a single utility used
   on every write — and excluding raw PII from realtime payloads — is a
   compliance-by-design stance, not an afterthought. This is arguably the most
   important domain-specific detail for a Bidvest-scale operator.

6. **It must integrate, not stand alone.** Estates run mixed vendor stacks; a
   reader, a boom controller, or a third-party dashboard needs to plug in. The
   port/adapter boundaries (repository, publisher, HTTP) mean ClickOn could drop
   in Redis for scale, PostgreSQL for durability, or an MQTT bridge for hardware
   — all without touching the rule engine that defines *who gets in*.

In short: the architecture treats gate access as a **real-time, auditable,
privacy-regulated decision system** — which is precisely what estate security
platforms like ClickOn are.

---

## Scripts

| Script              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start API in watch mode (`tsx`)                 |
| `npm run build`     | Type-check and emit to `dist/`                  |
| `npm start`         | Run the compiled server                         |
| `npm run simulate`  | Run the hardware simulator                      |
| `npm run typecheck` | `tsc --noEmit`                                  |
| `npm run lint`      | ESLint over `src/**/*.ts`                       |

---

## Deployment

The project is intentionally split across two hosts:

| Piece | Host | Why |
| ----- | ---- | --- |
| **Full app** (Express HTTP + WebSocket hub) | **Render** | Render supports long-lived WebSocket connections and a real Node process. |
| **Landing / showcase page** (`site/`) | **Vercel** | Static site hosting, instant global CDN. |

> **Why not the API on Vercel?** Vercel's serverless functions do not support
> long-lived WebSocket connections and reset in-memory state between
> invocations, so the realtime gate stream cannot run there. The static
> showcase page on Vercel talks to the API on Render instead.

### Deploy the full app to Render

The repo ships a [`render.yaml`](render.yaml) Blueprint, so it is one click:

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Teboho-Mohale98/gatekeeper-ts)

Or manually create a **Web Service** pointing at the repo with:

- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`
- **Health check path:** `/health`

Render injects `PORT` automatically. Once live, the service is reachable at
`https://<service-name>.onrender.com` (HTTP and `wss://…/realtime`).

### Deploy the landing page to Vercel

The [`vercel.json`](vercel.json) serves the static `site/` directory:

```bash
vercel --prod
```

Or use the one-click clone button in the [showcase page](https://gatekeeper-ts.vercel.app)
(Deploy → Vercel). After deploying, set `site/config.js` → `apiBaseUrl` to your
Render URL so the in-browser playground talks to the live engine.

### Configuration

All values are validated at boot (see `src/lib/env.ts`). The Blueprint sets
production defaults; override them in the host's dashboard.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `4000` | HTTP + WebSocket port (host-injected). |
| `NODE_ENV` | `development` | Log verbosity / production hardening. |
| `GATE_IDS` | `GATE-NORTH,…` | Comma-separated gates the registry knows. |
| `DEFAULT_INVITATION_TTL_MINUTES` | `120` | Default invitation lifetime. |
| `DEFAULT_INVITATION_MAX_USES` | `1` | Default usage allowance. |
| `SIMULATOR_BASE_URL` | `http://localhost:4000` | Target the simulator hits. |
| `SIMULATOR_INTERVAL_MS` | `4000` | Delay between simulated scans. |

---

## Roadmap / production hardening

The in-memory repositories are intentional for a self-contained demo; the ports
make upgrades mechanical. Natural next steps:

- **Persistence** — swap `InMemoryInvitationRepository` for PostgreSQL/Redis.
- **AuthN/Z** — add resident authentication (JWT/OIDC) and gate-to-platform mTLS.
- **Rate limiting & idempotency** — protect `/api/access/verify` and dedupe scans.
- **Observability** — expose Prometheus metrics and OpenTelemetry traces.
- **Testing** — unit tests for the rule chain and POPIA utility; contract tests
  for the Zod schemas; a `ws` integration test for the realtime protocol.
- **Hardware adapters** — MQTT/OSDP bridges so real readers, not just the
  simulator, can drive the engine.

---

_Built as a portfolio demonstration of senior-level TypeScript: strict types,
clean architecture, and a real-time, compliance-aware domain engine._
