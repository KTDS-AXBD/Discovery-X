#!/usr/bin/env bash
# post-edit-test.sh — 변경 파일 관련 테스트 자동 실행 (PostToolUse, DoD 3단계)
# 트리거 대상: service, schema, constants, lib 핵심 로직 파일만
# UI 컴포넌트/라우트 파일은 스킵 (빈번한 편집에 테스트 대기 방지)

FILE=$(python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)

# app/ 내 TS 파일만 대상
[[ "$FILE" != *.ts && "$FILE" != *.tsx ]] && exit 0
[[ "$FILE" != */app/* ]] && exit 0

# 라우트/UI 컴포넌트 제외 — 핵심 로직만 트리거
[[ "$FILE" == */routes/* ]] && exit 0
[[ "$FILE" == */ui/* && "$FILE" != *service* ]] && exit 0

# 모듈명 추출: features/{name}/ 또는 lib/{name}/
MODULE=""
if [[ "$FILE" =~ /features/([^/]+)/ ]]; then
  MODULE="${BASH_REMATCH[1]}"
elif [[ "$FILE" =~ /lib/([^/]+)/ ]]; then
  MODULE="${BASH_REMATCH[1]}"
elif [[ "$FILE" =~ /components/([^/]+)/ ]]; then
  MODULE="${BASH_REMATCH[1]}"
fi

[ -z "$MODULE" ] && exit 0

# 관련 테스트 파일 탐색 (unit + integration, 최대 5개)
TESTS=$(find tests/unit tests/integration -path "*${MODULE}*" -name "*.test.ts" 2>/dev/null | head -5)

[ -z "$TESTS" ] && exit 0

COUNT=$(echo "$TESTS" | wc -l)
echo "--- auto-test: ${MODULE} 관련 ${COUNT}개 테스트 실행 ---"
# shellcheck disable=SC2086
pnpm vitest run $TESTS 2>&1 | tail -20
