#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

PNPM_VERSION="${PNPM_VERSION:-10.16.1}"

if ! command -v corepack >/dev/null 2>&1; then
  echo "[error] corepack not found. Node.js 16.9+ 필요." >&2
  exit 1
fi

echo "[1/3] pnpm 준비 (corepack)"
corepack prepare "pnpm@${PNPM_VERSION}" --activate

echo "[2/3] 의존성 설치"
corepack pnpm install

echo "[3/3] 완료"
echo "다음 실행: scripts/dev-run.sh"
