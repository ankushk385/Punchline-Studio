#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f package-lock.json ]]; then
  echo "Expected package-lock.json in the project root." >&2
  exit 1
fi

npm ci --no-audit --no-fund --prefer-offline
npx tsc --noEmit
npm run server:build
