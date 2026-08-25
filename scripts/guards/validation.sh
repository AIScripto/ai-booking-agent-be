#!/usr/bin/env bash
# R3 (advisory): every controller reading req.body/req.query validates with a Zod schema.
# Counts controller files that read raw request input but never call safeParse/parse.
cd "$(dirname "$0")/../.." || exit 1
COUNT=0
for f in $(grep -rlE 'req\.(body|query|params)' src/controllers --include='*.ts' 2>/dev/null); do
  grep -qE 'safeParse|\.parse\(' "$f" || COUNT=$((COUNT + 1))
done
echo "$COUNT"
