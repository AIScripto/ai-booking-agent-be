#!/usr/bin/env bash
# Definition-of-Done gate for voice-agent-backend.
#
#   ./scripts/verify.sh                  full run (includes the slow test suite)
#   ./scripts/verify.sh --quick          skip the test suite
#   ./scripts/verify.sh --update-baseline  rewrite scripts/baseline.json from current counts
#
# Exit 0 = done. Non-zero = not done.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
. scripts/lib.sh

QUICK=0; UPDATE=0
for a in "$@"; do
  case "$a" in
    --quick) QUICK=1 ;;
    --update-baseline) UPDATE=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown flag: $a" >&2; exit 2 ;;
  esac
done

G=scripts/guards

if [ "$UPDATE" = "1" ]; then
  cat > "$BASELINE_FILE" <<JSON
{
  "_comment": "Recorded technical debt. Lower these freely; NEVER raise them. See AGENTS.md §9.",
  "_updated": "$(date +%Y-%m-%d)",
  "no_any": $($G/no-any.sh),
  "layering": $($G/layering.sh),
  "tenant_isolation": $($G/tenant-isolation.sh),
  "env_access": $($G/env-access.sh),
  "external_calls": $($G/external-calls.sh),
  "validation": $($G/validation.sh)
}
JSON
  echo "${C_YELLOW}Baseline rewritten from current state:${C_RESET}"; cat "$BASELINE_FILE"
  echo; echo "${C_RED}${C_BOLD}Only legitimate if you REDUCED debt. Raising a baseline hides a real bug.${C_RESET}"
  exit 0
fi

printf '%s\n' "${C_BOLD}Backend Definition-of-Done gate${C_RESET}"
printf '%s\n' "${C_DIM}repo: $(basename "$REPO_ROOT")  ·  $(date '+%Y-%m-%d %H:%M')${C_RESET}"

# ─────────────────────────────── Hard gates ───────────────────────────────
section "1. Build & types (hard gates)"

if npx tsc --noEmit > /tmp/vb_tsc.log 2>&1; then
  pass "tsc --noEmit (src): zero errors"
else
  fail "tsc --noEmit (src) failed"; info "$(tail -5 /tmp/vb_tsc.log)"
fi

# tsconfig excludes *.test.ts, so typecheck tests separately (AGENTS.md §10)
if npx tsc --noEmit --esModuleInterop --skipLibCheck --strict --target ES2022 \
     --moduleResolution node --types node,jest tests/*.ts > /tmp/vb_tsc_tests.log 2>&1; then
  pass "tsc (tests): zero errors"
else
  warn "tsc (tests) reported errors — invisible to the build, fix them"
  info "$(tail -5 /tmp/vb_tsc_tests.log)"
fi

section "2. Secrets & environment (hard gates)"
hard_zero "no real credentials in source" "$($G/secrets.sh)" \
  "Rotate the exposed key immediately, then move it to .env"

if git rev-parse --git-dir > /dev/null 2>&1; then
  if git ls-files --error-unmatch .env > /dev/null 2>&1; then
    fail ".env is TRACKED BY GIT — remove it from the index now"
    info "git rm --cached .env && git commit"
  else
    pass ".env is not tracked"
  fi
  # A schema change with no accompanying migration is an incomplete change (AGENTS.md §11)
  if ! git diff --quiet --exit-code HEAD -- prisma/schema.prisma 2>/dev/null; then
    if git status --porcelain prisma/migrations 2>/dev/null | grep -q .; then
      pass "schema.prisma changed, migration present"
    else
      fail "schema.prisma changed with NO migration in prisma/migrations"
      info "npm run prisma:migrate -- --name <describe_change>"
    fi
  fi
else
  warn "not a git repository — skipped git-based checks"
fi

# ─────────────────────────── Ratcheted gates ──────────────────────────────
section "3. Architecture & safety rules (ratcheted — see AGENTS.md §9)"

ratchet "R1 tenant isolation (queries missing tenantId)" "$($G/tenant-isolation.sh)" tenant_isolation \
  "Add tenantId to the where clause. Prefer updateMany/deleteMany with a compound where."
ratchet "R2 no-any (any + unjustified ts-ignore)"        "$($G/no-any.sh)"           no_any \
  "Type it properly, or use 'unknown' plus a narrowing check."
ratchet "R3 Zod validation at boundaries"                "$($G/validation.sh)"       validation \
  "Add a schema in src/schemas/ and safeParse it in the controller."
ratchet "R4 direct process.env reads outside config/"    "$($G/env-access.sh)"       env_access \
  "Add the key to src/config/index.ts and read it from config."
ratchet "R5 controllers touching Prisma"                 "$($G/layering.sh)"         layering \
  "Move the query into a service; the controller calls the service."
ratchet "R6 external calls without try/catch"            "$($G/external-calls.sh)"   external_calls \
  "Wrap the call and define the fallback behaviour."

# ───────────────────────────────── Tests ──────────────────────────────────
section "4. Tests"
if [ "$QUICK" = "1" ]; then
  warn "skipped (--quick). Run the full gate before declaring done."
elif ! command -v pg_isready > /dev/null 2>&1; then
  warn "pg_isready not found — cannot confirm Postgres; integration tests may fail"
elif ! pg_isready -q > /dev/null 2>&1; then
  fail "PostgreSQL is not reachable — integration tests need a live DB (AGENTS.md §10)"
else
  pass "PostgreSQL reachable"
  info "running jest (slow, >2 min)…"
  if npx jest --silent --forceExit > /tmp/vb_test.log 2>&1; then
    pass "jest: all suites green"
    info "$(grep -E '^(Tests|Test Suites):' /tmp/vb_test.log | tr '\n' ' ')"
  else
    fail "jest: failures present"
    info "$(grep -E '^(Tests|Test Suites):|✕' /tmp/vb_test.log | head -8 | tr '\n' ' ')"
    info "full log: /tmp/vb_test.log"
  fi
fi

# ──────────────────────────────── Summary ─────────────────────────────────
section "Summary"
printf '  %s%s passed%s   %s%s warnings%s   %s%s failed%s\n' \
  "$C_GREEN" "$PASS_COUNT" "$C_RESET" "$C_YELLOW" "$WARN_COUNT" "$C_RESET" "$C_RED" "$FAIL_COUNT" "$C_RESET"

if [ -n "$RATCHET_IMPROVED" ]; then
  printf '\n  %sDebt was reduced. Lock it in:%s ./scripts/verify.sh --update-baseline\n' "$C_GREEN" "$C_RESET"
fi

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf '\n%sNOT DONE%s — %s gate(s) failed. See docs/DEFINITION_OF_DONE.md\n' "$C_RED$C_BOLD" "$C_RESET" "$FAIL_COUNT"
  exit 1
fi
printf '\n%sGate passed.%s Complete the manual DoD items in docs/DEFINITION_OF_DONE.md before reporting done.\n' "$C_GREEN$C_BOLD" "$C_RESET"
exit 0
