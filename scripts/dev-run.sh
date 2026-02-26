#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PNPM_VERSION="${PNPM_VERSION:-10.16.1}"

if ! command -v corepack >/dev/null 2>&1; then
  echo "[error] corepack not found. Node.js 16.9+ 필요." >&2
  exit 1
fi

corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null
exec corepack pnpm dev
