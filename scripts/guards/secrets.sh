#!/usr/bin/env bash
# R4 hard gate: no real credentials anywhere in tracked source. Placeholders (xxxx) allowed.
cd "$(dirname "$0")/../.." || exit 1
grep -raoE 'sk_live_[A-Za-z0-9]{10,}|cal_live_[A-Za-z0-9]{16,}|SG\.[A-Za-z0-9_-]{22,}|AC[0-9a-f]{32}|AIza[A-Za-z0-9_-]{30,}|gho_[A-Za-z0-9]{30,}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY' \
  src prisma scripts .env.example 2>/dev/null \
  | grep -vE 'x{4,}|XXXX' | wc -l | tr -d ' '
