#!/usr/bin/env bash
# post-edit-lint.sh — 변경 파일 lint + 조건부 typecheck (PostToolUse)

FILE=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# app/ 내 TS/TSX 파일만 lint
if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]] && [[ "$FILE" == */app/* ]]; then
  pnpm eslint "$FILE" 2>&1 | tail -10
fi

# 스키마/타입/인증 파일 변경 시 typecheck 자동 실행
if [[ "$FILE" == *schema*.ts || "$FILE" == */types/* || "$FILE" == */auth/* || "$FILE" == */constants/* ]]; then
  echo "--- typecheck (schema/type/auth change detected) ---"
  pnpm typecheck 2>&1 | tail -20
fi
