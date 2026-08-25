#!/usr/bin/env bash
# R5: controllers must not touch Prisma or orchestrate. Counts offending controller files.
cd "$(dirname "$0")/../.." || exit 1
grep -rlE "from '\.\./services/db\.service'|from '\.\.\/services\/db\.service'|\bprisma\." src/controllers --include='*.ts' 2>/dev/null | wc -l | tr -d ' '
