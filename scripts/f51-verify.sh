#!/usr/bin/env bash
# F51 Migration Verification Script
# DX-DSGN-021 Phase 5~6 검증 스크립트
set -euo pipefail

# ── Colors ──────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ─────────────────────────────────────
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[PASS]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
step()  { echo -e "\n${BOLD}▶ $*${NC}"; }
divider() { echo -e "${CYAN}─────────────────────────────────────────────────${NC}"; }

confirm() {
  local msg="${1:-계속 진행할까요?}"
  echo -en "${YELLOW}$msg [y/N] ${NC}"
  read -r reply
  [[ "$reply" =~ ^[Yy]$ ]] || { warn "중단됨."; exit 1; }
}

# ── Environment Check ───────────────────────────
check_env_var() {
  local var_name="$1"
  local required="${2:-true}"
  if [[ -z "${!var_name:-}" ]]; then
    if [[ "$required" == "true" ]]; then
      fail "환경변수 $var_name 미설정"
      exit 1
    else
      warn "환경변수 $var_name 미설정 (선택)"
      return 1
    fi
  fi
  ok "$var_name 설정됨"
  return 0
}

check_export_env() {
  step "환경변수 확인 (export)"
  check_env_var "CLOUDFLARE_ACCOUNT_ID_OLD"
}

check_import_env() {
  step "환경변수 확인 (import)"
  check_env_var "CLOUDFLARE_ACCOUNT_ID_NEW"
  check_env_var "CLOUDFLARE_API_TOKEN_NEW"
}

check_verify_env() {
  step "환경변수 확인 (verify)"
  check_env_var "CRON_SECRET_NEW"
}

# ── export: D1 데이터 Export (Phase 5.1) ────────
do_export() {
  divider
  echo -e "${BOLD}📦 Phase 5.1 — D1 데이터 Export (기존 계정)${NC}"
  divider

  check_export_env

  local backup_file="/tmp/dx-backup-$(date +%Y%m%d-%H%M%S).sql"

  info "Export 대상: CLOUDFLARE_ACCOUNT_ID_OLD=${CLOUDFLARE_ACCOUNT_ID_OLD:0:8}..."
  info "백업 파일: $backup_file"
  confirm "기존 계정에서 D1 데이터를 export할까요?"

  step "1/2 — wrangler d1 export 실행"
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_OLD" \
  npx wrangler d1 export discovery-x-db --remote --output "$backup_file"

  step "2/2 — 백업 파일 확인"
  if [[ -f "$backup_file" ]]; then
    local size
    size=$(ls -lh "$backup_file" | awk '{print $5}')
    ok "백업 완료: $backup_file ($size)"
  else
    fail "백업 파일이 생성되지 않았어요: $backup_file"
    exit 1
  fi

  divider
  ok "Export 완료"
  info "다음 단계: bash scripts/f51-verify.sh import"
}

# ── import: D1 데이터 Import (Phase 5.2) ────────
do_import() {
  divider
  echo -e "${BOLD}📥 Phase 5.2 — D1 데이터 Import (새 계정)${NC}"
  divider

  check_import_env

  # 가장 최신 백업 파일 탐색
  local backup_file
  backup_file=$(ls -t /tmp/dx-backup-*.sql 2>/dev/null | head -1)

  if [[ -z "$backup_file" ]]; then
    fail "백업 파일을 찾을 수 없어요. 먼저 export를 실행하세요."
    info "  bash scripts/f51-verify.sh export"
    exit 1
  fi

  local size
  size=$(ls -lh "$backup_file" | awk '{print $5}')
  info "Import 파일: $backup_file ($size)"
  info "Import 대상: CLOUDFLARE_ACCOUNT_ID_NEW=${CLOUDFLARE_ACCOUNT_ID_NEW:0:8}..."
  confirm "새 계정에 D1 데이터를 import할까요?"

  step "1/2 — wrangler d1 execute --file 실행"
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
  npx wrangler d1 execute discovery-x-db --remote --file "$backup_file"

  step "2/2 — 주요 테이블 row count 검증"
  local tables=("users" "discoveries" "ideas" "proposals" "radar_items" "feature_requests")
  for table in "${tables[@]}"; do
    local count
    count=$(CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
      CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
      npx wrangler d1 execute discovery-x-db --remote \
        --command "SELECT count(*) as cnt FROM $table;" 2>&1 | grep -oP '"cnt":\s*\K[0-9]+' || echo "ERROR")
    if [[ "$count" == "ERROR" ]]; then
      fail "$table: 조회 실패"
    else
      ok "$table: $count rows"
    fi
  done

  divider
  ok "Import 완료"
  info "다음 단계: bash scripts/f51-verify.sh vectorize"
}

# ── vectorize: Vectorize 인덱스 재구축 (Phase 5.3) ──
do_vectorize() {
  divider
  echo -e "${BOLD}🔄 Phase 5.3 — Vectorize 인덱스 재구축 (Cron 트리거)${NC}"
  divider

  check_verify_env

  local domain="https://dx.minu.best"
  local secret="$CRON_SECRET_NEW"

  info "도메인: $domain"
  confirm "Vectorize 재구축 Cron을 수동 트리거할까요?"

  local endpoints=(
    "/api/cron/embeddings"
    "/api/cron/vectorize?type=graph"
    "/api/cron/vectorize?type=memory"
    "/api/cron/vectorize?type=signal"
  )

  local i=1
  local total=${#endpoints[@]}
  for ep in "${endpoints[@]}"; do
    step "$i/$total — $ep"
    # secret을 쿼리파라미터로 추가 (이미 ?가 있으면 &, 없으면 ?)
    local url
    if [[ "$ep" == *"?"* ]]; then
      url="${domain}${ep}&secret=${secret}"
    else
      url="${domain}${ep}?secret=${secret}"
    fi

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
    if [[ "$http_code" == "200" ]]; then
      ok "HTTP $http_code"
    else
      warn "HTTP $http_code (비정상 — 배포 후 재시도 필요할 수 있어요)"
    fi
    ((i++))
  done

  step "Vectorize 인덱스 상태 확인"
  if check_env_var "CLOUDFLARE_ACCOUNT_ID_NEW" "false" 2>/dev/null; then
    CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
    CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN_NEW:-}" \
    npx wrangler vectorize get-index dx-discovery-embeddings 2>&1 || warn "Vectorize 인덱스 조회 실패"
  else
    warn "CLOUDFLARE_ACCOUNT_ID_NEW 미설정 — 인덱스 상태 확인 생략"
  fi

  divider
  ok "Vectorize 재구축 트리거 완료"
  info "다음 단계: bash scripts/f51-verify.sh verify"
}

# ── verify: 통합 검증 (Phase 6.1) ──────────────
do_verify() {
  divider
  echo -e "${BOLD}✅ Phase 6.1 — 통합 검증 체크리스트${NC}"
  divider

  check_verify_env

  local domain="https://dx.minu.best"
  local secret="$CRON_SECRET_NEW"
  local pass=0
  local total=0
  local results=()

  check_one() {
    local label="$1"
    local url="$2"
    local expected="${3:-200}"
    ((total++))

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000")

    if [[ "$http_code" == "$expected" ]]; then
      ok "$label — HTTP $http_code"
      ((pass++))
      results+=("${GREEN}PASS${NC}  $label")
    else
      fail "$label — HTTP $http_code (기대: $expected)"
      results+=("${RED}FAIL${NC}  $label (HTTP $http_code)")
    fi
  }

  step "1/5 — 메인 앱 접근"
  check_one "메인 앱 (dx.minu.best)" "$domain" "200"

  step "2/5 — API Health"
  check_one "API Health" "$domain/api/health" "200"

  step "3/5 — Agent Worker Health"
  check_one "Agent Worker" "https://agent-worker.dx.minu.best/health" "200"

  step "4/5 — Cron 엔드포인트 (daily 샘플)"
  check_one "Cron Daily" "$domain/api/cron/daily?secret=$secret" "200"

  step "5/5 — Google OAuth 리다이렉트"
  local oauth_code
  oauth_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$domain/auth/google" 2>/dev/null || echo "000")
  ((total++))
  # OAuth는 302 리다이렉트가 정상
  if [[ "$oauth_code" == "302" || "$oauth_code" == "303" ]]; then
    ok "OAuth Redirect — HTTP $oauth_code"
    ((pass++))
    results+=("${GREEN}PASS${NC}  OAuth Redirect")
  elif [[ "$oauth_code" == "200" ]]; then
    ok "OAuth Redirect — HTTP $oauth_code (로그인 페이지)"
    ((pass++))
    results+=("${GREEN}PASS${NC}  OAuth Redirect (200)")
  else
    fail "OAuth Redirect — HTTP $oauth_code (기대: 302/303)"
    results+=("${RED}FAIL${NC}  OAuth Redirect (HTTP $oauth_code)")
  fi

  # ── 결과 요약 ──
  divider
  echo -e "${BOLD}📊 검증 결과 요약${NC}"
  divider
  for r in "${results[@]}"; do
    echo -e "  $r"
  done
  divider

  if [[ $pass -eq $total ]]; then
    echo -e "  ${GREEN}${BOLD}$pass/$total PASS — 통합 검증 완료!${NC}"
  else
    echo -e "  ${RED}${BOLD}$pass/$total PASS — 실패 항목 확인 필요${NC}"
  fi
  divider
}

# ── compare: 기존 vs 새 DB row count 비교 (Phase 5 검증) ──
do_compare() {
  divider
  echo -e "${BOLD}📊 DB Row Count 비교 — 기존 vs 새 계정${NC}"
  divider

  check_export_env
  check_import_env

  local tables=("users" "discoveries" "ideas" "proposals" "radar_items" "feature_requests")
  local pass=0
  local total=0

  printf "\n  %-22s %10s %10s %s\n" "TABLE" "OLD" "NEW" "STATUS"
  printf "  %-22s %10s %10s %s\n" "──────────────────────" "──────────" "──────────" "──────"

  for table in "${tables[@]}"; do
    ((total++))

    local old_count new_count

    old_count=$(CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_OLD" \
      npx wrangler d1 execute discovery-x-db --remote \
        --command "SELECT count(*) as cnt FROM $table;" 2>&1 | grep -oP '"cnt":\s*\K[0-9]+' || echo "-1")

    new_count=$(CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
      CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
      npx wrangler d1 execute discovery-x-db --remote \
        --command "SELECT count(*) as cnt FROM $table;" 2>&1 | grep -oP '"cnt":\s*\K[0-9]+' || echo "-1")

    local status
    if [[ "$old_count" == "-1" || "$new_count" == "-1" ]]; then
      status="${RED}ERROR${NC}"
    elif [[ "$old_count" == "$new_count" ]]; then
      status="${GREEN}MATCH${NC}"
      ((pass++))
    else
      status="${RED}DIFF${NC}"
    fi

    printf "  %-22s %10s %10s " "$table" "$old_count" "$new_count"
    echo -e "$status"
  done

  divider
  if [[ $pass -eq $total ]]; then
    echo -e "  ${GREEN}${BOLD}$pass/$total MATCH — 데이터 정합성 확인!${NC}"
  else
    echo -e "  ${YELLOW}${BOLD}$pass/$total MATCH — 불일치 항목 확인 필요${NC}"
  fi
  divider
}

# ── all: 전체 순차 실행 ─────────────────────────
do_all() {
  divider
  echo -e "${BOLD}🚀 F51 전체 마이그레이션 검증 (export → import → vectorize → verify)${NC}"
  divider

  confirm "전체 과정을 순차 실행할까요? (각 단계에서 추가 확인이 있어요)"

  do_export
  echo ""
  do_import
  echo ""
  do_vectorize
  echo ""
  do_verify

  divider
  echo -e "${GREEN}${BOLD}🎉 F51 전체 마이그레이션 검증 완료!${NC}"
  divider
}

# ── Usage ───────────────────────────────────────
usage() {
  echo -e "${BOLD}F51 Migration Verification Script${NC}"
  echo -e "DX-DSGN-021 Phase 5~6 검증 스크립트\n"
  echo -e "${BOLD}Usage:${NC} bash scripts/f51-verify.sh <command>\n"
  echo -e "${BOLD}Commands:${NC}"
  echo "  export     D1 데이터 Export (기존 계정에서)"
  echo "  import     D1 데이터 Import (새 계정으로)"
  echo "  vectorize  Vectorize 인덱스 재구축 (Cron 트리거)"
  echo "  verify     통합 검증 (Phase 6.1 자동 체크)"
  echo "  compare    기존 vs 새 DB row count 비교"
  echo "  all        export → import → vectorize → verify 순차"
  echo ""
  echo -e "${BOLD}환경변수:${NC}"
  echo "  CLOUDFLARE_ACCOUNT_ID_OLD  기존 계정 ID (export/compare)"
  echo "  CLOUDFLARE_ACCOUNT_ID_NEW  새 계정 ID (import/verify/compare)"
  echo "  CLOUDFLARE_API_TOKEN_NEW   새 계정 API Token"
  echo "  CRON_SECRET_NEW            Cron 인증 Secret (vectorize/verify)"
}

# ── Main ────────────────────────────────────────
case "${1:-}" in
  export)    do_export ;;
  import)    do_import ;;
  vectorize) do_vectorize ;;
  verify)    do_verify ;;
  compare)   do_compare ;;
  all)       do_all ;;
  *)         usage ;;
esac
