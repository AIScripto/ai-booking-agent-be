#!/usr/bin/env bash
# R6 (advisory): every fetch()/googleapis call sits inside a try block.
# Counts service files that make an outbound call but contain no try/catch at all.
cd "$(dirname "$0")/../.." || exit 1
COUNT=0
for f in $(grep -rlE '\bfetch\(|calendar\.(events|freebusy)\.' src/services --include='*.ts' 2>/dev/null); do
  grep -q 'try[[:space:]]*{' "$f" || COUNT=$((COUNT + 1))
done
echo "$COUNT"
