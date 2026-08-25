#!/usr/bin/env bash
# R1: every tenant-scoped Prisma read/write filters by tenantId in the same statement.
# Flattens each statement onto one line, then flags queries with a `where` that omits tenantId.
# Tenant-global models (tenant lookup by its own id, googleCredential by tenantId) are exempt.
cd "$(dirname "$0")/../.." || exit 1
find src -name '*.ts' -type f 2>/dev/null | while read -r f; do
  tr '\n' ' ' < "$f" | sed 's/prisma\./\nprisma./g' \
    | grep -E '^prisma\.[a-zA-Z]+\.(findFirst|findUnique|findMany|update|updateMany|delete|deleteMany|count|aggregate)' \
    | grep -vE '^prisma\.tenant\.' \
    | grep -vE 'tenantId'
done | wc -l | tr -d ' '
