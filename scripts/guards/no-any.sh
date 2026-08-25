#!/usr/bin/env bash
# R2: no `any`, no unjustified ts-ignore. Emits a single count on stdout.
cd "$(dirname "$0")/../.." || exit 1
ANY=$(grep -rnE ':[[:space:]]*any\b|<any>|as any|any\[\]|:[[:space:]]*Promise<any>' src --include='*.ts' 2>/dev/null | wc -l)
IGN=$(grep -rn -B1 -E '@ts-(ignore|expect-error)' src --include='*.ts' 2>/dev/null \
      | grep -E '@ts-(ignore|expect-error)' | grep -vE '@ts-(ignore|expect-error).*[A-Za-z]{10,}' | wc -l)
echo $(( ANY + IGN )) | tr -d ' '
