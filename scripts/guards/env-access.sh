#!/usr/bin/env bash
# R4: all env access flows through src/config. Counts direct process.env reads outside config/.
cd "$(dirname "$0")/../.." || exit 1
grep -rn 'process\.env' src --include='*.ts' 2>/dev/null \
  | grep -v '^src/config/' | grep -v 'NODE_ENV' | wc -l | tr -d ' '
