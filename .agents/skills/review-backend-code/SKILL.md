---
name: review-backend-code
description: >-
  Use this skill whenever the user asks you to review, audit, assess, or check the
  quality of backend code in the AI booking-agent backend — a diff, a pull request,
  a single file, or the service as a whole. Also use it before declaring any backend
  change done.
---

# Review Backend Code

Canonical rules: [`../../rules/backend-standards.md`](../../rules/backend-standards.md),
[`../../rules/database-governance.md`](../../rules/database-governance.md), and
[`../../../AGENTS.md`](../../../AGENTS.md) §1 (R1–R8). The bar is
[`../../../docs/DEFINITION_OF_DONE.md`](../../../docs/DEFINITION_OF_DONE.md).

**This is a read-and-report skill.** Per [`AGENT_RULES.md`](../../../../AGENT_RULES.md) §2,
a review request is answer-only: report findings, do not edit. Move to fixing only on an
explicit instruction.

## Step 0: Run the Gate First, Not Last

`npm run verify` already encodes seven of the eight rules as executable guards. Run it
before reading anything — it tells you which rules are mechanically broken so your reading
time goes to the rules that need judgement (R8 latency, business correctness) rather than
the ones a script can count.

If it cannot run (no Postgres — the suite needs a live database), say so in the report
rather than implying a clean gate.

## Step 1: Severity, Not a Flat List

Rank every finding. This service handles appointment records for healthcare tenants, so
severity is driven by blast radius, not by how tidy the fix is:

| Severity | Meaning |
| :-- | :-- |
| 🔴 P1 | Cross-tenant data exposure, missing authentication, or a live-caller outage |
| 🟠 P2 | Data corruption, double-booking, unvalidated external input, swallowed failure |
| 🟡 P3 | Type debt, layering violation, silent config failure |

A cross-tenant read is a **data breach, not a bug**. Never file one as P3 because the patch
is one line.

## Step 2: The Tenant-Isolation Pass (R1)

The highest-value read in this repo. For every Prisma call in the diff:

- Does it filter by `tenantId` **in the same statement**? A `findUnique({ where: { id } })`
  followed by an `if (row.tenantId !== tenantId)` is fetch-then-check — flag it, because the
  guard is easy to drop in a later edit and the shape gives no protection by construction.
- Is `tenantId` **derived from a verified identity**, or read from a client-supplied
  `x-tenant-id` header / query param? A UUID-format check is a *validation* check, not an
  *authorization* check. Do not describe a route as secured because it validates the shape
  of the tenant id it was handed.
- Mutations must use `updateMany`/`deleteMany` with `{ id, tenantId }` and **reject when the
  affected count is 0**. A bare `update({ where: { id } })` is cross-tenant writable.

## Step 3: The Zero-Trust Input Pass (R3)

- Every body, query, param, and webhook payload is `safeParse`d before any logic reads it.
- Raw `req.body` never crosses into a service — only the parsed, typed value.
- Webhook payloads are the hardest case: they arrive from Vapi/Retell over the public
  internet and their shape changes without notice. `any` on a webhook path is where
  untrusted vendor input enters the system — treat it as P2, not P3.
- Check that the route is actually *reachable only* as intended. An endpoint that validates
  its input perfectly but has no API-key or auth check is still open.

## Step 4: The Voice-Latency Pass (R8)

Only for `/voice/*` and anything it calls — but do this pass properly, because a human is
on the phone hearing dead air:

- No new synchronous third-party call in the request/response cycle.
- Notifications, calendar sync, analytics and logging are fire-and-forget — and every
  fire-and-forget promise has a `.catch()`. An unhandled rejection kills the process.
- Queries `select` only the fields used; no relation tree pulled to read one column.
- No new *correctness* dependency on `slot-cache.service.ts`. It is a per-process `Map`, not
  a shared cache — two instances hold different truths.

## Step 5: Resilience & Layering (R5, R6)

- Every external call (Google Calendar, Cal.com, Twilio, SendGrid, Daily, Stripe) has
  `try/catch` **and a defined fallback**. "It throws and the error middleware catches it" is
  not a fallback.
- No failed integration may roll back a confirmed booking. The booking is the source of
  truth; the notification is best-effort.
- Booking writes handle Prisma **`P2002`** as a user-facing conflict, not a 500. The database
  unique constraint is the referee for double-booking — not an application-level check.
- Controllers hold no business logic and never touch `prisma` directly.

## Step 6: Config & Leakage (R4)

- No `process.env` read outside `src/config/index.ts`. Each one is a key that fails at
  runtime instead of at boot, which defeats the Zod config loader.
- A new env var must land in **both** the `configSchema` and `.env.example`, or the next
  deploy starts a container that exits 1.
- No response body carries a stack trace, an internal exception message, or a secret.
  Check HTML responses too — interpolating a caught error or a query param into a template
  string is a reflected-XSS sink, not just an information leak.

## Step 7: Report

Lead with the P1s. For each finding give the file:line, what breaks, and the concrete
consequence — "any caller who knows a resource UUID can offboard another tenant's doctor",
not "missing tenant filter". State what you verified and what you could not.

Close by naming any finding that is **already recorded** in
[`../../../docs/DEFINITION_OF_DONE.md`](../../../docs/DEFINITION_OF_DONE.md) "Known debt" so
the user can tell new regressions from tracked debt. If the diff *reduces* a tracked count,
say so — that baseline should be lowered in the same change.

Never propose raising a count in `scripts/baseline.json` as a remedy.
