#!/usr/bin/env bash
# Shared helpers for the verify gates. Bash 3.2 compatible (macOS default). No jq required.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE_FILE="$REPO_ROOT/scripts/baseline.json"

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'
else
  C_RESET=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_DIM=""; C_BOLD=""
fi

FAIL_COUNT=0
WARN_COUNT=0
PASS_COUNT=0
RATCHET_IMPROVED=""

# Read a numeric baseline value by key. Prints 0 if absent.
baseline_get() {
  local key="$1"
  [ -f "$BASELINE_FILE" ] || { echo 0; return; }
  local v
  v="$(sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\([0-9]\{1,\}\).*/\1/p" "$BASELINE_FILE" | head -1)"
  [ -n "$v" ] && echo "$v" || echo 0
}

pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf '  %sPASS%s  %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn() { WARN_COUNT=$((WARN_COUNT + 1)); printf '  %sWARN%s  %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); printf '  %sFAIL%s  %s\n' "$C_RED" "$C_RESET" "$1"; }
info() { printf '        %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
section() { printf '\n%s%s%s\n' "$C_BOLD$C_BLUE" "$1" "$C_RESET"; }

# Ratchet comparison: name, current count, baseline key, remediation hint
ratchet() {
  local name="$1" current="$2" key="$3" hint="$4"
  local base; base="$(baseline_get "$key")"

  if [ "$current" -gt "$base" ]; then
    fail "$name: $current (baseline $base) — you added $((current - base))"
    [ -n "$hint" ] && info "$hint"
    info "Fix your change. Do NOT raise the baseline."
  elif [ "$current" -lt "$base" ]; then
    pass "$name: $current (baseline $base) — debt reduced by $((base - current)) 🎉"
    RATCHET_IMPROVED="yes"
    info "Lower the baseline: scripts/verify.sh --update-baseline"
  else
    pass "$name: $current (at baseline)"
  fi
}

# Hard gate: must be zero, no baseline tolerance.
hard_zero() {
  local name="$1" current="$2" hint="$3"
  if [ "$current" -gt 0 ]; then
    fail "$name: $current"
    [ -n "$hint" ] && info "$hint"
  else
    pass "$name: clean"
  fi
}

# Count matches of an extended regex across TypeScript sources under a path.
count_ts() {
  local pattern="$1"; shift
  grep -rnE "$pattern" "$@" --include='*.ts' --include='*.tsx' 2>/dev/null | wc -l | tr -d ' '
}
