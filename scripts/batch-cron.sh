#!/usr/bin/env bash
# batch-cron.sh — crontab에서 호출하는 배치 분석 래퍼
# 사용법: 0 1 * * * /path/to/batch-cron.sh >> /var/log/dx-batch.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${LOG_DIR:-/tmp}/dx-batch-$(date +%Y%m%d-%H%M%S).log"

cd "$PROJECT_DIR"

echo "=== Batch started at $(date -Iseconds) ===" | tee -a "$LOG_FILE"
bash "$SCRIPT_DIR/batch-runner.sh" all 2>&1 | tee -a "$LOG_FILE"
EXIT_CODE=${PIPESTATUS[0]}
echo "=== Batch finished at $(date -Iseconds) (exit=$EXIT_CODE) ===" | tee -a "$LOG_FILE"

exit $EXIT_CODE
