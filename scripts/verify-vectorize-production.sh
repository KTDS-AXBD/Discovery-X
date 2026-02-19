#!/usr/bin/env bash
#
# Discovery-X 프로덕션 Vectorize 검증 스크립트
# 프로덕션 환경의 시맨틱 검색 Cron 엔드포인트를 순차 호출하여 E2E 동작을 검증한다.
#
# 사용법:
#   CRON_SECRET=xxx ./scripts/verify-vectorize-production.sh
#

set -euo pipefail

PROD_URL="https://dx.minu.best"
PASS=0
FAIL=0
TOTAL=4

# ─── 색상 ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ─── 필수 환경변수 확인 ──────────────────────────────────────────────────────
if [ -z "${CRON_SECRET:-}" ]; then
  echo -e "${RED}ERROR: CRON_SECRET 환경변수가 설정되지 않았습니다.${NC}"
  echo "  사용법: CRON_SECRET=xxx $0"
  exit 1
fi

# ─── 헬퍼 함수 ───────────────────────────────────────────────────────────────

# JSON 필드 추출 (jq 없이 순수 bash로 처리)
json_field() {
  local json="$1"
  local field="$2"
  # 숫자/문자열 값 추출
  echo "$json" | grep -oP "\"${field}\"\s*:\s*\K[^,}]+" | tr -d '"' | head -1
}

check_result() {
  local name="$1"
  local status="$2"
  if [ "$status" = "PASS" ]; then
    echo -e "  ${GREEN}[PASS]${NC} $name"
    ((PASS++))
  else
    echo -e "  ${RED}[FAIL]${NC} $name"
    ((FAIL++))
  fi
}

echo ""
echo "=================================================="
echo " Discovery-X 프로덕션 Vectorize E2E 검증"
echo " 대상: $PROD_URL"
echo " 시각: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "=================================================="
echo ""

# ─── 1. Health Check ─────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/4] GET /api/health (인증 없음)${NC}"

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$PROD_URL/api/health" 2>/dev/null)
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HEALTH_CODE" = "200" ]; then
  HEALTH_STATUS=$(json_field "$HEALTH_BODY" "status")
  if [ "$HEALTH_STATUS" = "healthy" ]; then
    check_result "Health: status=$HEALTH_STATUS, code=$HEALTH_CODE" "PASS"
  else
    echo "  응답: $HEALTH_BODY"
    check_result "Health: status=$HEALTH_STATUS (expected: healthy)" "FAIL"
  fi
else
  echo "  HTTP $HEALTH_CODE"
  check_result "Health: HTTP $HEALTH_CODE (expected: 200)" "FAIL"
fi

# ─── 2. Memory Vectorize ─────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[2/4] GET /api/cron/memory-vectorize (Bearer 인증)${NC}"

MEM_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PROD_URL/api/cron/memory-vectorize" 2>/dev/null)
MEM_CODE=$(echo "$MEM_RESPONSE" | tail -1)
MEM_BODY=$(echo "$MEM_RESPONSE" | sed '$d')

if [ "$MEM_CODE" = "200" ]; then
  MEM_INDEXED=$(json_field "$MEM_BODY" "indexed")
  MEM_ERRORS=$(json_field "$MEM_BODY" "errors")
  MEM_TOTAL=$(json_field "$MEM_BODY" "total")
  MEM_SKIPPED=$(json_field "$MEM_BODY" "skipped")

  # skipped: true인 경우도 정상 (FF 비활성 또는 바인딩 없음)
  if [ "$MEM_SKIPPED" = "true" ]; then
    echo "  응답: $MEM_BODY"
    check_result "Memory Vectorize: skipped (FF/바인딩 미설정)" "PASS"
  elif [ -n "$MEM_INDEXED" ] && [ -n "$MEM_TOTAL" ]; then
    echo "  indexed=$MEM_INDEXED, errors=${MEM_ERRORS:-0}, total=$MEM_TOTAL"
    check_result "Memory Vectorize: indexed=$MEM_INDEXED, errors=${MEM_ERRORS:-0}" "PASS"
  else
    echo "  응답: $MEM_BODY"
    check_result "Memory Vectorize: 예상 필드(indexed/total) 누락" "FAIL"
  fi
else
  echo "  HTTP $MEM_CODE"
  check_result "Memory Vectorize: HTTP $MEM_CODE (expected: 200)" "FAIL"
fi

# ─── 3. Signal Vectorize ─────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[3/4] GET /api/cron/signal-vectorize (Bearer 인증)${NC}"

SIG_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PROD_URL/api/cron/signal-vectorize" 2>/dev/null)
SIG_CODE=$(echo "$SIG_RESPONSE" | tail -1)
SIG_BODY=$(echo "$SIG_RESPONSE" | sed '$d')

if [ "$SIG_CODE" = "200" ]; then
  SIG_INDEXED=$(json_field "$SIG_BODY" "indexed")
  SIG_ERRORS=$(json_field "$SIG_BODY" "errors")
  SIG_TOTAL=$(json_field "$SIG_BODY" "total")
  SIG_SKIPPED=$(json_field "$SIG_BODY" "skipped")

  if [ "$SIG_SKIPPED" = "true" ]; then
    echo "  응답: $SIG_BODY"
    check_result "Signal Vectorize: skipped (FF/바인딩 미설정)" "PASS"
  elif [ -n "$SIG_INDEXED" ] && [ -n "$SIG_TOTAL" ]; then
    echo "  indexed=$SIG_INDEXED, errors=${SIG_ERRORS:-0}, total=$SIG_TOTAL"
    check_result "Signal Vectorize: indexed=$SIG_INDEXED, errors=${SIG_ERRORS:-0}" "PASS"
  else
    echo "  응답: $SIG_BODY"
    check_result "Signal Vectorize: 예상 필드(indexed/total) 누락" "FAIL"
  fi
else
  echo "  HTTP $SIG_CODE"
  check_result "Signal Vectorize: HTTP $SIG_CODE (expected: 200)" "FAIL"
fi

# ─── 4. Graph Vectorize ──────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}[4/4] GET /api/cron/graph-vectorize (Bearer 인증)${NC}"

GRAPH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$PROD_URL/api/cron/graph-vectorize" 2>/dev/null)
GRAPH_CODE=$(echo "$GRAPH_RESPONSE" | tail -1)
GRAPH_BODY=$(echo "$GRAPH_RESPONSE" | sed '$d')

if [ "$GRAPH_CODE" = "200" ]; then
  GRAPH_INDEXED=$(json_field "$GRAPH_BODY" "indexed")
  GRAPH_ERRORS=$(json_field "$GRAPH_BODY" "errors")
  GRAPH_SKIPPED=$(json_field "$GRAPH_BODY" "skipped")

  if [ "$GRAPH_SKIPPED" = "true" ]; then
    echo "  응답: $GRAPH_BODY"
    check_result "Graph Vectorize: skipped (FF/바인딩 미설정)" "PASS"
  elif [ -n "$GRAPH_INDEXED" ]; then
    echo "  indexed=$GRAPH_INDEXED, errors=${GRAPH_ERRORS:-0}"
    check_result "Graph Vectorize: indexed=$GRAPH_INDEXED, errors=${GRAPH_ERRORS:-0}" "PASS"
  else
    echo "  응답: $GRAPH_BODY"
    check_result "Graph Vectorize: 예상 필드(indexed/errors) 누락" "FAIL"
  fi
else
  echo "  HTTP $GRAPH_CODE"
  check_result "Graph Vectorize: HTTP $GRAPH_CODE (expected: 200)" "FAIL"
fi

# ─── 최종 요약 ────────────────────────────────────────────────────────────────
echo ""
echo "=================================================="
if [ "$FAIL" -eq 0 ]; then
  echo -e " ${GREEN}결과: 전체 PASS ($PASS/$TOTAL)${NC}"
else
  echo -e " ${RED}결과: $FAIL FAIL / $PASS PASS (총 $TOTAL)${NC}"
fi
echo "=================================================="
echo ""

exit "$FAIL"
