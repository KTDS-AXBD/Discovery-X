#!/usr/bin/env bash
# pre-edit-guard.sh — 민감 파일 편집 차단 (PreToolUse)
# exit 2 = 차단, exit 0 = 허용

FILE=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

case "$FILE" in
  *.dev.vars|*credentials*|*.env|*.env.*)
    echo "BLOCK: 환경 변수 파일 직접 편집 금지 — .dev.vars는 수동 관리"
    exit 2 ;;
  */drizzle/*.sql|*/migrations/*.sql)
    echo "BLOCK: 마이그레이션 SQL 직접 편집 금지 — /ax-p1-migrate 사용"
    exit 2 ;;
esac
