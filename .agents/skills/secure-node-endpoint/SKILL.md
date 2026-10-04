---
name: secure-node-endpoint
description: >-
  Use this skill whenever the user asks you to add or change authentication,
  authorization, session handling, API-key verification, tenant scoping, or CORS in
  the AI booking-agent backend — or to secure, harden, or lock down an existing
  route.
---

# Secure Node Endpoint

Canonical rules: [`../../rules/backend-standards.md`](../../rules/backend-standards.md),
[`../../../AGENTS.md`](../../../AGENTS.md) §1 (R1, R3, R4) and §3.

> **Confirmation gate.** [`AGENT_RULES.md`](../../../../AGENT_RULES.md) §4 requires you to
> **stop and ask before any change to authentication or authorization policy.** Present the
> proposed policy — who may call what, how identity is proven, what breaks for existing
> callers — and get approval before writing code. This skill covers *how* to implement it
> once approved, not permission to start.

## Step 0: Know the Current State Before Changing It

The service today has **no authentication middleware**. `src/middlewares/` contains only
`error.middleware.ts`, and `tenantId` is read from a client-supplied `x-tenant-id` header or
query param. `JWT_SECRET` exists in the deployment environment but is referenced nowhere in
`src/`.

This matters for two reasons: there is no existing pattern to copy, and **every route is
currently a caller** of the header-based approach. Adding real auth is a breaking change to
a live contract — the voice agent is mid-call against the deployed API
([`AGENT_RULES.md`](../../../../AGENT_RULES.md) §7). Plan the migration, do not just add a
guard and move on.

## Step 1: Separate the Three Caller Classes

They need different mechanisms. Do not build one middleware that tries to serve all three:

| Caller | Mechanism | Notes |
| :-- | :-- | :-- |
| **Staff dashboard** | Session/JWT → `req.auth.tenantId` | Human, interactive, refreshable |
| **Voice vendor** (Vapi/Retell) | Shared secret on the webhook | Machine, no user identity |
| **Public booking page** | Unauthenticated, tenant in the path | Must expose *only* public data |

## Step 2: Identity Is Derived, Never Accepted

The core rule. After this change, `tenantId` used in any query comes from the **verified
credential**, not from the request.

- A validated-UUID header is *validation*, not *authorization*. Deleting the header read is
  the point of the work — leaving it as a fallback preserves the whole vulnerability.
- Attach the resolved identity to the request (`req.auth = { userId, tenantId }`) and have
  controllers pass it down. Services keep taking `tenantId` as an explicit argument so R1's
  same-statement filter stays visible and greppable.
- If a caller may act for several tenants, verify membership against the database on each
  request. Do not trust a tenant list carried in the token body.

## Step 3: Shared Secrets Need Constant-Time Comparison

Webhook and API-key checks compare attacker-supplied bytes against a secret. `!==` on
strings short-circuits on the first differing byte and leaks length and prefix through
timing. Use `crypto.timingSafeEqual` on equal-length buffers, and length-check first.

Also pin the header you accept. Falling back to the raw `authorization` header when it is
not `Bearer`-prefixed widens what counts as a valid credential for no benefit.

## Step 4: Every Route Is Covered, Explicitly

Apply protection at the **router** level, not per-handler, so a newly added route is secure
by default rather than by the author remembering. Then enumerate the exceptions in one
place, with a comment saying why each is public.

Audit the whole surface when you do this — sibling routes registered in the same file are
routinely missed. An endpoint that proxies a third-party API on a caller-supplied tenant id
is an abuse and enumeration vector even when it returns no stored data.

## Step 5: Lock the Response Side Too

- **CORS**: a bare `cors()` sends `Access-Control-Allow-Origin: *` on every route. Pin it to
  the configured frontend origin, through `src/config/index.ts` (R4). If credentials are
  used, a wildcard is invalid anyway.
- **No leakage on failure**: an auth failure returns a flat `401` with a generic message.
  Never distinguish "unknown user" from "wrong password" in the response, and never return
  the caught exception's text.
- **Never interpolate untrusted input into an HTML response.** Query params and error
  messages rendered into a template string are a reflected-XSS sink. Escape, or return JSON.
- **Never log a credential** — no tokens, passwords, API keys, or full webhook auth headers.
  Existing webhook logging dumps the whole body; check what you are about to add to it.

## Step 6: Config

New secret → the `configSchema` in `src/config/index.ts` **and** `.env.example` (R4). A
required secret with no default means the process exits at boot instead of running in a
silently insecure state — that is the desired behaviour. Do not give a secret a fallback
value.

## Step 7: Tests Are Not Optional Here

Use [`../write-backend-test/SKILL.md`](../write-backend-test/SKILL.md). For every route
touched:

- Unauthenticated request → **401**.
- Valid credential for tenant A requesting tenant B's row → **404/403 and no data**.
- Forged or tampered token → **401**, not a 500.
- The public routes that are *meant* to stay open → still reachable.

## Step 8: Verify and Report

`npm run verify` must exit 0. In your summary, state plainly which routes are now protected,
which remain public **and why**, and what existing callers must change. If any endpoint is
still open, say so — per
[`../../../docs/DEFINITION_OF_DONE.md`](../../../docs/DEFINITION_OF_DONE.md), no endpoint may
be described as secured while the surface around it is not.
