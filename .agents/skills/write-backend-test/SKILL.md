---
name: write-backend-test
description: >-
  Use this skill whenever the user asks you to write, extend, or fix tests for the
  AI booking-agent backend — a new endpoint, a service, a webhook path, a bug
  regression, or a concurrency case. Also use it when a change needs test coverage
  before it can be called done.
---

# Write Backend Test

Canonical rules: [`../../../AGENTS.md`](../../../AGENTS.md) §10 and
[`../../../docs/DEFINITION_OF_DONE.md`](../../../docs/DEFINITION_OF_DONE.md) §4.
Stack: Jest · ts-jest · supertest. Tests live in `tests/*.test.ts`.

## Step 0: Confirm Postgres Is Actually Up

Integration tests run against a **live PostgreSQL** on `DATABASE_URL`. There is no test
container. If `pg_isready` fails, the suite produces confusing connection errors that look
like assertion failures — check first, and if the database is unavailable say so rather than
reporting the suite as broken.

Do not start Postgres yourself — see [`AGENT_RULES.md`](../../../../AGENT_RULES.md) §5.

## Step 1: Mock the Network, Never the Database

- **Mock external HTTP** — `global.fetch`, Google Calendar, Cal.com, Twilio, SendGrid,
  Stripe, Daily. A test that hits a vendor is slow, flaky, and occasionally expensive.
- **Never mock Prisma.** The database is the referee for double-booking and the only real
  check on tenant isolation. A mocked `prisma` proves your mock works, not your code.
- `jest.config.js` sets `clearMocks`/`resetMocks`/`restoreMocks`, so per-test mock state is
  already cleaned. Do not hand-roll teardown that duplicates it.

## Step 2: The Three Mandatory Cases For a New Endpoint

Every new endpoint needs all three. Two out of three is not coverage:

1. **Happy path** — a valid request returns the documented shape and status.
2. **Validation failure** — a malformed input returns **400** with a useful message, and
   *not* a 500 and *not* a stack trace.
3. **Tenant isolation** — seed a row under tenant A, request it as tenant B, and assert
   tenant B cannot read, update, or delete it.

Case 3 is the one that gets skipped and the one that matters most. Write it first. Assert on
the *absence of data* (404 / empty set / zero affected rows), not merely on a status code
that a permissive handler could also return.

## Step 3: Concurrency Is Tested By Racing, Not By Sequencing

Any path that can double-book needs a test that fires two writes **concurrently** —
`await Promise.allSettled([...])` — and asserts exactly one succeeds while the other
surfaces Prisma **`P2002`** as a user-facing conflict. Two `await`ed calls one after the
other do not exercise the race and will pass against broken code.

## Step 4: Voice-Path Tests Assert Latency Behaviour, Not Just Output

For `/voice/*`, the contract includes *when* work happens:

- Assert that side effects (notification, calendar sync, logging) do **not** block the
  response — the handler resolves without awaiting them.
- Assert the fallback fires when a mocked vendor call rejects, and that the caller still
  gets a usable answer rather than a 500.
- Do not assert a wall-clock duration. It is flaky on shared CI. Assert the *shape* — that
  the third-party mock was not awaited in the critical path.

## Step 5: Regression Tests Name the Bug

When fixing a defect, write the failing test **before** the fix and keep it. Name it after
the observed behaviour, not the patch: `rejects an offboard request for another tenant's
resource`, never `tests updateMany`.

## Step 6: Typecheck the Tests Explicitly

`tsconfig.json` **excludes** `**/*.test.ts`, so a type error in a test is invisible to
`npx tsc --noEmit`. `verify.sh` typechecks tests separately — never rely on the build to
catch a broken test file.

## Step 7: Verify

The suite is **slow (>2 min)**. Use `npx jest <pattern>` while iterating, then run the full
`npm run verify` before declaring done — a passing single file tells you nothing about what
your fixture seeding did to the shared database.

Report the **actual** result. If suites fail, include the output rather than summarising it
away. See [`../../../docs/DEFINITION_OF_DONE.md`](../../../docs/DEFINITION_OF_DONE.md) §7.
