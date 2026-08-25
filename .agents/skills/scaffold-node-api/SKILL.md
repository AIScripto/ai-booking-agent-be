---
name: scaffold-node-api
description: >-
  Use this skill whenever the user asks you to create a new backend API endpoint,
  controller, service, route, or refactor an existing Node.js API route in the
  AI booking-agent backend.
---

# Scaffold Node API

Canonical rules: [`../../rules/backend-standards.md`](../../rules/backend-standards.md),
[`../../rules/database-governance.md`](../../rules/database-governance.md), and
[`../../../AGENTS.md`](../../../AGENTS.md) §1–§2. Stack: Node 20 · TypeScript (strict) ·
Express 4 · Prisma 6 · PostgreSQL · Zod 3 · Jest.

Layout: `src/routes/` → `src/controllers/` → `src/services/`, with schemas in
`src/schemas/`, config in `src/config/index.ts`, and error handling in
`src/middlewares/error.middleware.ts`.

## Step 0: Is This a Voice-Agent Path?
If the endpoint is called by the live voice agent (Vapi/Retell) mid-conversation — anything
under `voice.routes.ts` / `voice.controller.ts` — **latency is a correctness property**. A
human is on the phone hearing dead air. Do no new work inside the request/response cycle:
defer side effects, reuse the slot cache (`slot-cache.service.ts`), and never add a
synchronous third-party call to a hot path (R8).

## Step 1: Determine Route Type & Auth Handling
- **Protected route**: extract and verify the authorization token (JWT). If missing or
  invalid, return `401 Unauthorized` immediately. Pass the resolved `userId` **and
  `tenantId`** down to the service layer.
- **Public route** (login, signup, webhooks): no incoming token required, but validation is
  stricter, not looser — webhook bodies arrive from third-party vendors over the public
  internet and their shapes change without notice. Never log passwords, tokens, or secrets.

## Step 2: Strict Input Validation (R3)
- Every external input — body, query, params, webhook payload — is **Zod-parsed before any
  business logic reads it**. Put the schema in `src/schemas/` (see `voice.schema.ts`).
- Never pass raw `req.body` to a service. Only the parsed, typed payload crosses the
  boundary.

## Step 3: Tenant Isolation (R1 — non-negotiable)
Every Prisma query touching tenant data filters by `tenantId` **in the same statement** —
not in a later `.filter()`, not via a helper that "usually" adds it. A cross-tenant read is
a data breach, not a bug. Enforced by `scripts/guards/tenant-isolation.sh`.

## Step 4: Fat Services, Skinny Controllers (R5)
- **Controller**: extract token, Zod-parse input, call the service, map the result to an
  HTTP response. Nothing else. A controller must never touch `prisma` directly.
- **Service**: all business logic, Prisma queries, and data transformation.
  Enforced by `scripts/guards/layering.sh`.

## Step 5: Config, Errors & External Calls
- All environment access goes through `src/config/index.ts` — no stray `process.env` reads,
  no secrets in code (R4).
- Every external network call (Google Calendar, Cal.com, SMS, email, payment) has a
  `try/catch` **and a defined fallback** (R6).
- Throw standardized errors and let `error.middleware.ts` shape the response. Zero stack
  traces and zero secret data in any API response.
- Strict TypeScript: no `any`, no `@ts-ignore`/`@ts-expect-error` without an adjacent
  justification comment (R2).

## Step 6: Documentation
Add TSDoc above service functions with `@security` (role and tenant/row-level requirements),
`@transactional` (atomic write boundaries), and `@throws` where applicable.

## Step 7: Schema Changes Require Confirmation
If the endpoint needs a Prisma schema change, **stop and ask the user first** — present the
migration diff and data impact before applying anything. See
[`../../rules/database-governance.md`](../../rules/database-governance.md).

## Step 8: Definition of Done Verification
Add or update Jest coverage in `tests/`, then run `npm run verify` in `backend/` — it runs
`tsc --noEmit`, the Jest suite, and the guard scripts. (`npm run verify:quick` skips tests
during iteration; the script is `typecheck`, **not** `type-check`.) Autonomously debug and
fix any failure. Never run `./scripts/verify.sh --update-baseline` to silence a guard. Only
present the finished endpoint once `npm run verify` exits 0.
