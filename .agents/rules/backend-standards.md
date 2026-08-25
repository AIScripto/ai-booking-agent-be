# Backend Architecture & Engineering Standards

> **Canonical spec**: [`../../AGENTS.md`](../../AGENTS.md) §1–§9 is the single source of
> truth for this repo (rules R1–R8 and the baseline ratchet). The rules below restate and
> sharpen it. On any conflict, `AGENTS.md` wins.
>
> Stack: Node 20 · TypeScript (strict) · Express 4 · Prisma 6 · PostgreSQL · Zod 3 · Jest.
> Layout: `src/routes/` → `src/controllers/` → `src/services/`, schemas in `src/schemas/`,
> config in `src/config/index.ts`, error shaping in `src/middlewares/error.middleware.ts`.

## 1. Input Validation & Security Boundaries
- **Strict Validation (R3)**: ALL external input — request body, query, params, and
  third-party webhook payloads — must be Zod-parsed **before any business logic reads it**.
  Never trust raw client input; never pass raw `req.body` to a service.
- **Data Hygiene**: Ensure zero secret exposure in API responses. Always strip passwords,
  tokens, and internal IDs before returning data to the frontend.
- **Config Boundary (R4)**: No secrets in code. All environment access flows through
  `src/config/index.ts` — no stray `process.env` reads.
- **Access Control**: Enforce strict role-based access control on every authenticated
  endpoint.

## 2. Tenant Isolation (R1 — Non-Negotiable)
- Every Prisma query touching tenant data filters by `tenantId` **in the same statement** —
  not in a later `.filter()`, not through a helper that "usually" adds it.
- A cross-tenant read is a data breach, not a bug. Enforced by
  `scripts/guards/tenant-isolation.sh`.

## 3. Service Layer & Business Logic
- **Fat Services, Skinny Controllers (R5)**: Controllers handle only token extraction, Zod
  parsing, the service call, and HTTP response mapping. All core business logic and every
  database interaction lives in a dedicated service under `src/services/`. A controller
  must never touch `prisma` directly. Enforced by `scripts/guards/layering.sh`.
- **Error Handling**: Never return raw stack traces to the client. Catch exceptions in the
  service layer and throw standardized errors for `error.middleware.ts` to shape.
- **External Calls (R6)**: Every outbound network call — Google Calendar, Cal.com, SMS,
  email, payment, telehealth — has a `try/catch` **and a defined fallback**.

## 4. Latency Is a Correctness Property (R8)
- The primary consumer is a **live voice AI phone agent** (Vapi/Retell) that calls webhooks
  mid-conversation while a human waits on the line. A slow response is a broken response —
  the caller hears dead air.
- No new work inside the request/response cycle of a voice call. Defer side effects, use
  `slot-cache.service.ts` rather than recomputing availability, and never add a synchronous
  third-party call to a hot path.

## 5. Type Safety
- Strict TypeScript. No `any`. No `@ts-ignore` / `@ts-expect-error` without an adjacent
  justification comment (R2). Enforced by `scripts/guards/no-any.sh`.

## 6. Documentation & Guardrails
- **JSDoc/TSDoc Mandate**: Always include professional, enterprise-grade comments for public
  APIs, service methods, and complex database queries.
- **Guardrail Tags**: Annotate high-risk operations with explicit tags:
  - `@security` (role & tenant/row-level permission requirements)
  - `@transactional` (atomic write boundaries & isolation rules)
  - `@throws` (expected exception types)

## 7. Definition of Done
- `npm run verify` must exit 0 — it runs `tsc --noEmit`, the Jest suite in `tests/`, and
  every guard in `scripts/guards/`. Use `npm run verify:quick` to skip tests during
  iteration only. The npm script is `typecheck`, **not** `type-check`.
- Guard violations are recorded in `scripts/baseline.json`. Lower those counts freely;
  **NEVER** raise them, and never run `./scripts/verify.sh --update-baseline` to make a
  failing gate pass.
- Schema work additionally requires `npx prisma validate` and `npx prisma generate`, plus
  the explicit user confirmation described in
  [`database-governance.md`](./database-governance.md).
