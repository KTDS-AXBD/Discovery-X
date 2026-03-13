#!/usr/bin/env bash
# post-migrate-check.sh — 마이그레이션 ↔ test helper 동기화 체크 (PostToolUse Bash)

CMD=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# db:generate 또는 db:migrate 실행 후에만 체크
if [[ "$CMD" == *"db:generate"* || "$CMD" == *"db:migrate"* || "$CMD" == *"drizzle-kit"* ]]; then
  MIGRATION_COUNT=$(ls drizzle/*.sql 2>/dev/null | wc -l)
  # runMigrationSQL 호출 횟수 (함수 정의 1줄 제외 = 실제 호출 수)
  RAW_COUNT=$(grep -c 'runMigrationSQL' tests/helpers/db.ts 2>/dev/null || echo 0)
  HELPER_COUNT=$((RAW_COUNT - 1))  # 함수 정의 1줄 제외
  if [ "$MIGRATION_COUNT" -ne "$HELPER_COUNT" ]; then
    echo "⚠️ 마이그레이션 SQL($MIGRATION_COUNT개) ↔ test helper($HELPER_COUNT개) 불일치"
    echo "   → /ax-p1-migrate로 동기화하거나 tests/helpers/db.ts에 누락 SQL 추가 필요"
  fi
fi
