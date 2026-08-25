# Database Governance & State Safety (Non-Negotiable)

> Schema: `prisma/schema.prisma` (Prisma 6 · PostgreSQL). Seed: `prisma/seed.ts`.
> Scripts: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:seed`.

- **Mandatory Confirmation for Database Updates**: **ALWAYS ask and obtain explicit user
  confirmation** before proceeding with:
  - Any database schema changes, migrations, table/column alterations, data drops, or seed
    resets — including `prisma migrate dev`, `prisma migrate reset`, `prisma db push`, and
    `npm run prisma:seed`.
  - Core authentication/authorization policy modifications.
  - Destructive file operations or environment/configuration changes affecting state.
  - *Requirement*: Present the exact migration SQL / Prisma diff and potential data impacts
    for review before applying.
- **Never Reset Shared State**: `prisma migrate reset` and `prisma db push --force-reset`
  drop data. They are never run to "get unstuck" — ask first, every time.
- **Backward-Compatible Migrations**: Migrations must be safe, deterministic, and
  backward-compatible with the currently deployed API. Prefer additive changes; stage
  destructive ones (add → backfill → switch reads → drop) across separate migrations. The
  live voice agent is mid-call against the running schema.
- **Tenant Scoping by Design**: Every tenant-owned model carries `tenantId` with an index,
  and every foreign key is explicit. Add composite indexes for the query shapes the
  services actually issue (e.g. `(tenantId, startsAt)` for availability lookups) rather
  than indexing columns speculatively.
- **Validate Before Concluding**: After any schema edit, run `npx prisma validate` and
  `npx prisma generate`, then the full `npm run verify` gate. A generated-client drift that
  compiles locally but not in CI is an incomplete change.
- **Migrations Are Committed**: Generated migration files belong in the repo alongside the
  schema change. Never edit an already-applied migration — write a new one.
