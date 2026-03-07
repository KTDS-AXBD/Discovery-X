#!/usr/bin/env bash
# post-edit-lint.sh — 변경 파일만 eslint 실행
# 전체 typecheck는 /ax-04-lint로 명시 실행

FILE=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# app/ 내 TS/TSX 파일만 lint
if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]] && [[ "$FILE" == */app/* ]]; then
  pnpm eslint "$FILE" 2>&1 | tail -10
fi
