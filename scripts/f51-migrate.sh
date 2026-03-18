#!/usr/bin/env bash
# F51 Infrastructure Migration Script
# DX-DSGN-021 Phase 1~4 실행 스크립트
# Usage: bash scripts/f51-migrate.sh <check|phase1|phase2|phase3|phase4|all>
set -euo pipefail

# ── 색상 정의 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── 유틸 함수 ──
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
header()  { echo -e "\n${BOLD}━━━ $* ━━━${NC}\n"; }

confirm() {
  local msg="${1:-계속할까요?}"
  read -r -p "$(echo -e "${YELLOW}$msg [y/N]${NC} ")" answer
  [[ "$answer" =~ ^[Yy]$ ]] || { warn "사용자가 취소했어요."; exit 0; }
}

require_env() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    error "환경변수 $var_name 이(가) 설정되지 않았어요."
    error "export $var_name=\"<값>\" 으로 설정 후 다시 실행하세요."
    exit 1
  fi
  success "$var_name 설정 확인"
}

# ── 프로젝트 루트 ──
PROJECT_ROOT="/home/sinclair/work/axbd/Discovery-X"
REPO="KTDS-AXBD/Discovery-X"
OLD_ORG="AX-BD-Team"
NEW_ORG="KTDS-AXBD"
OLD_PROJECT_NUM=4
OLD_DB_ID="1bab6138-6b2f-45eb-8285-55ba7b543957"
OLD_ACCOUNT_ID="02ae9a2bead25d99caa8f3258b81f568"

# ═══════════════════════════════════════════════════
# check — 전제 조건 확인 (P1~P7)
# ═══════════════════════════════════════════════════
phase_check() {
  header "전제 조건 확인 (P1~P7)"

  info "P1. GitHub 인증 상태"
  if gh auth status 2>&1 | grep -q "Logged in"; then
    success "P1: gh auth 로그인 완료"
  else
    error "P1: gh auth login 필요"
  fi

  info "P2. KTDS-AXBD org Owner 권한"
  local role_new
  role_new=$(gh api "orgs/$NEW_ORG/memberships/Sinclair-Seo" --jq '.role' 2>/dev/null || echo "FAIL")
  if [[ "$role_new" == "admin" ]]; then
    success "P2: $NEW_ORG Owner 확인"
  else
    error "P2: $NEW_ORG Owner 권한 필요 (현재: $role_new)"
  fi

  info "P3. AX-BD-Team org Owner 권한"
  local role_old
  role_old=$(gh api "orgs/$OLD_ORG/memberships/Sinclair-Seo" --jq '.role' 2>/dev/null || echo "FAIL")
  if [[ "$role_old" == "admin" ]]; then
    success "P3: $OLD_ORG Owner 확인"
  else
    error "P3: $OLD_ORG Owner 권한 필요 (현재: $role_old)"
  fi

  info "P4. Cloudflare API Token"
  if [[ -n "${CLOUDFLARE_API_TOKEN_NEW:-}" ]]; then
    success "P4: CLOUDFLARE_API_TOKEN_NEW 설정됨"
  else
    warn "P4: CLOUDFLARE_API_TOKEN_NEW 미설정 (Phase 2 이후 필요)"
  fi

  info "P5. minu.best DNS 관리 권한"
  warn "P5: Cloudflare Dashboard에서 수동 확인 필요"

  info "P6. wrangler CLI"
  if npx wrangler --version 2>/dev/null | grep -q "wrangler"; then
    success "P6: wrangler $(npx wrangler --version 2>/dev/null)"
  else
    error "P6: wrangler CLI 미설치"
  fi

  info "P7. 새 CF 계정 ID"
  if [[ -n "${CLOUDFLARE_ACCOUNT_ID_NEW:-}" ]]; then
    success "P7: CLOUDFLARE_ACCOUNT_ID_NEW 설정됨"
  else
    warn "P7: CLOUDFLARE_ACCOUNT_ID_NEW 미설정 (Phase 2 이후 필요)"
  fi

  echo ""
  success "전제 조건 확인 완료 — 위 결과를 검토하세요."
}

# ═══════════════════════════════════════════════════
# Phase 1: GitHub Transfer 후속 작업
# ═══════════════════════════════════════════════════
phase1() {
  header "Phase 1: GitHub Transfer 후속 작업"

  warn "리포 Transfer는 GitHub UI에서 수동으로 완료해야 해요."
  warn "https://github.com/$OLD_ORG/Discovery-X/settings → Danger Zone → Transfer"
  warn "New owner: $NEW_ORG"
  echo ""

  # ── 1.2 Transfer 완료 검증 ──
  info "1.2 Transfer 완료 확인..."
  local repo_owner
  repo_owner=$(gh repo view "$REPO" --json owner --jq '.owner.login' 2>/dev/null || echo "NOT_FOUND")
  if [[ "$repo_owner" == "$NEW_ORG" ]]; then
    success "리포 Transfer 확인: $REPO"
  else
    error "리포가 아직 Transfer되지 않았어요 (현재: $repo_owner)"
    error "GitHub UI에서 Transfer를 먼저 완료하세요."
    exit 1
  fi

  local issue_count
  issue_count=$(gh issue list --repo "$REPO" --state all --json number --jq '. | length' 2>/dev/null || echo "0")
  info "Issues 이전 확인: ${issue_count}건"

  confirm "1.3 Actions Secrets 재등록을 진행할까요?"

  # ── 1.3 Actions Secrets 재등록 (5개) ──
  info "1.3 Actions Secrets 재등록 (5개)..."

  require_env "CLOUDFLARE_ACCOUNT_ID_NEW"
  require_env "CLOUDFLARE_API_TOKEN_NEW"

  # 나머지 3개는 선택적 — 미설정 시 경고
  for secret_var in ANTHROPIC_API_KEY_NEW SESSION_SECRET_NEW CRON_SECRET_NEW; do
    if [[ -z "${!secret_var:-}" ]]; then
      warn "$secret_var 미설정 — 해당 Secret은 건너뛰어요."
    fi
  done

  gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$REPO" --body "$CLOUDFLARE_ACCOUNT_ID_NEW"
  success "Secret: CLOUDFLARE_ACCOUNT_ID"

  gh secret set CLOUDFLARE_API_TOKEN --repo "$REPO" --body "$CLOUDFLARE_API_TOKEN_NEW"
  success "Secret: CLOUDFLARE_API_TOKEN"

  if [[ -n "${ANTHROPIC_API_KEY_NEW:-}" ]]; then
    gh secret set ANTHROPIC_API_KEY --repo "$REPO" --body "$ANTHROPIC_API_KEY_NEW"
    success "Secret: ANTHROPIC_API_KEY"
  fi

  if [[ -n "${SESSION_SECRET_NEW:-}" ]]; then
    gh secret set SESSION_SECRET --repo "$REPO" --body "$SESSION_SECRET_NEW"
    success "Secret: SESSION_SECRET"
  fi

  if [[ -n "${CRON_SECRET_NEW:-}" ]]; then
    gh secret set CRON_SECRET --repo "$REPO" --body "$CRON_SECRET_NEW"
    success "Secret: CRON_SECRET"
  fi

  info "Secrets 등록 검증..."
  gh secret list --repo "$REPO"

  # ── 1.4 Environment 확인 ──
  info "1.4 Environment 확인..."
  gh api "repos/$REPO/environments" --jq '.environments[].name' 2>/dev/null || warn "Environment 없음 (첫 배포 시 자동 생성)"

  # ── 1.5 git remote 갱신 ──
  confirm "1.5 git remote를 KTDS-AXBD로 변경할까요?"

  info "1.5 git remote 갱신..."
  cd "$PROJECT_ROOT"
  git remote set-url origin "git@github.com:$REPO.git"
  success "remote origin → git@github.com:$REPO.git"
  git remote -v

  # ── 1.7 GitHub Project 이전 ──
  confirm "1.7 GitHub Project 아이템을 마이그레이션할까요?"

  info "1.7 GitHub Project 이전..."

  info "Step 1: 기존 Project 아이템 백업"
  gh project item-list "$OLD_PROJECT_NUM" --owner "$OLD_ORG" --format json > /tmp/project-items-backup.json
  local item_count
  item_count=$(jq '.items | length' /tmp/project-items-backup.json)
  success "백업 완료: ${item_count}개 아이템"

  info "Step 2: 새 Org에 Project 생성"
  local new_project_num
  new_project_num=$(gh project create --owner "$NEW_ORG" --title "Discovery-X" --format json --jq '.number')
  success "Project #$new_project_num 생성 완료 ($NEW_ORG)"

  info "Step 3: 아이템 재등록"
  jq -r '.items[] | select(.content.url != null) | .content.url' /tmp/project-items-backup.json | \
    sed "s|$OLD_ORG|$NEW_ORG|g" | \
    while read -r url; do
      if gh project item-add "$new_project_num" --owner "$NEW_ORG" --url "$url" 2>/dev/null; then
        success "Added: $url"
      else
        warn "SKIP: $url"
      fi
    done

  warn "Step 4: Project 커스텀 필드(Status, Priority, REQ Code, Work Type)는 GitHub UI에서 수동 설정이 필요해요."

  echo ""
  success "Phase 1 완료!"
  info "롤백 방법: KTDS-AXBD → AX-BD-Team로 재 Transfer + git remote set-url origin git@github.com:$OLD_ORG/Discovery-X.git"
}

# ═══════════════════════════════════════════════════
# Phase 2: Cloudflare 리소스 생성
# ═══════════════════════════════════════════════════
phase2() {
  header "Phase 2: Cloudflare 리소스 생성"

  require_env "CLOUDFLARE_ACCOUNT_ID_NEW"
  require_env "CLOUDFLARE_API_TOKEN_NEW"

  export CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW"
  export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW"

  # ── 2.1 D1 Database 생성 ──
  confirm "2.1 D1 Database를 생성할까요?"

  info "2.1 D1 Database 생성..."
  npx wrangler d1 create discovery-x-db
  echo ""
  warn "위 출력에서 database_id를 복사하세요."
  warn "export NEW_DB_ID=\"<출력된_database_id>\" 설정 후 계속하세요."
  echo ""

  if [[ -z "${NEW_DB_ID:-}" ]]; then
    read -r -p "$(echo -e "${YELLOW}NEW_DB_ID를 입력하세요: ${NC}")" NEW_DB_ID
    if [[ -z "$NEW_DB_ID" ]]; then
      error "NEW_DB_ID가 필요해요."
      exit 1
    fi
    export NEW_DB_ID
  fi

  # ── 2.2 D1 마이그레이션 적용 ──
  confirm "2.2 D1 마이그레이션을 적용할까요? (67개 SQL)"

  info "2.2 D1 마이그레이션 적용..."
  cd "$PROJECT_ROOT"
  npx wrangler d1 migrations apply discovery-x-db --remote
  success "마이그레이션 적용 완료"

  info "테이블 수 검증..."
  npx wrangler d1 execute discovery-x-db --remote \
    --command "SELECT count(*) as cnt FROM sqlite_master WHERE type='table';"

  # ── 2.3 Vectorize 인덱스 생성 (6개) ──
  confirm "2.3 Vectorize 인덱스를 생성할까요? (6개)"

  info "2.3 Vectorize 인덱스 생성..."

  # 1536차원 (OpenAI text-embedding-3-small)
  info "1536차원 인덱스 (3개)..."
  npx wrangler vectorize create dx-discovery-embeddings --dimensions=1536 --metric=cosine && success "dx-discovery-embeddings" || warn "이미 존재할 수 있어요"
  npx wrangler vectorize create dx-evidence-embeddings  --dimensions=1536 --metric=cosine && success "dx-evidence-embeddings"  || warn "이미 존재할 수 있어요"
  npx wrangler vectorize create dx-radar-embeddings     --dimensions=1536 --metric=cosine && success "dx-radar-embeddings"     || warn "이미 존재할 수 있어요"

  # 512차원 (Workers AI / custom)
  info "512차원 인덱스 (3개)..."
  npx wrangler vectorize create dx-graph-embeddings  --dimensions=512 --metric=cosine && success "dx-graph-embeddings"  || warn "이미 존재할 수 있어요"
  npx wrangler vectorize create dx-memory-embeddings --dimensions=512 --metric=cosine && success "dx-memory-embeddings" || warn "이미 존재할 수 있어요"
  npx wrangler vectorize create dx-signal-embeddings --dimensions=512 --metric=cosine && success "dx-signal-embeddings" || warn "이미 존재할 수 있어요"

  info "Vectorize 인덱스 목록..."
  npx wrangler vectorize list

  # ── 2.4 Pages 프로젝트 생성 ──
  confirm "2.4 Pages 프로젝트를 생성할까요?"

  info "2.4 Pages 프로젝트 생성..."
  npx wrangler pages project create discovery-x --production-branch=master && success "Pages 프로젝트 생성 완료" || warn "이미 존재할 수 있어요"

  # ── 2.5 wrangler.toml 일괄 업데이트 ──
  confirm "2.5 wrangler.toml database_id를 일괄 교체할까요? (5개 파일)"

  info "2.5 wrangler.toml 업데이트..."
  cd "$PROJECT_ROOT"

  for f in wrangler.toml agent-worker/wrangler.toml radar-worker/wrangler.toml collab-worker/wrangler.toml venture-worker/wrangler.toml; do
    if [[ -f "$f" ]]; then
      sed -i "s/$OLD_DB_ID/$NEW_DB_ID/g" "$f"
      success "Updated: $f"
    else
      warn "파일 없음: $f"
    fi
  done

  # account_id 주석 업데이트 (메인 wrangler.toml)
  sed -i "s/$OLD_ACCOUNT_ID/$CLOUDFLARE_ACCOUNT_ID_NEW/g" wrangler.toml
  success "account_id 주석 업데이트: wrangler.toml"

  info "검증: NEW_DB_ID 포함 파일 수..."
  local match_count
  match_count=$(grep -rl "$NEW_DB_ID" wrangler.toml agent-worker/wrangler.toml radar-worker/wrangler.toml collab-worker/wrangler.toml venture-worker/wrangler.toml 2>/dev/null | wc -l)
  info "NEW_DB_ID 포함: ${match_count}개 파일"

  if grep -q "$OLD_DB_ID" wrangler.toml agent-worker/wrangler.toml radar-worker/wrangler.toml collab-worker/wrangler.toml venture-worker/wrangler.toml 2>/dev/null; then
    warn "OLD_DB_ID가 아직 남아 있는 파일이 있어요!"
  else
    success "OLD_DB_ID 완전 제거 확인"
  fi

  # ── 2.6 Workers 배포 (4개) ──
  confirm "2.6 Workers를 배포할까요? (4개)"

  info "2.6 Workers 배포..."

  info "agent-worker 배포..."
  cd "$PROJECT_ROOT/agent-worker"
  npx wrangler deploy
  success "agent-worker 배포 완료"

  info "radar-worker 배포..."
  cd "$PROJECT_ROOT/radar-worker"
  npx wrangler deploy
  success "radar-worker 배포 완료"

  info "collab-worker 배포..."
  cd "$PROJECT_ROOT/collab-worker"
  npx wrangler deploy
  success "collab-worker 배포 완료"

  info "venture-worker 배포..."
  cd "$PROJECT_ROOT/venture-worker"
  npx wrangler deploy
  success "venture-worker 배포 완료"

  cd "$PROJECT_ROOT"

  # ── 2.7 Secrets 설정 ──
  confirm "2.7 Pages + Workers Secrets를 설정할까요?"

  info "2.7 Secrets 설정..."

  # Pages Secrets (10개)
  info "Pages Secrets (10개)..."
  for SECRET_NAME in SESSION_SECRET ANTHROPIC_API_KEY OPENAI_API_KEY DEEPSEEK_API_KEY GOOGLE_AI_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET RESEND_API_KEY CRON_SECRET ANTHROPIC_ADMIN_API_KEY; do
    if [[ -n "${!SECRET_NAME:-}" ]]; then
      echo "${!SECRET_NAME}" | npx wrangler pages secret put "$SECRET_NAME" --project-name discovery-x
      success "Pages: $SECRET_NAME"
    else
      warn "Pages: $SECRET_NAME 미설정 — 건너뜀"
    fi
  done

  # agent-worker Secrets (2개)
  info "agent-worker Secrets (2개)..."
  if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
    echo "$ANTHROPIC_API_KEY" | npx wrangler secret put ANTHROPIC_API_KEY --name agent-worker
    success "agent-worker: ANTHROPIC_API_KEY"
  fi
  if [[ -n "${SESSION_SECRET:-}" ]]; then
    echo "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET --name agent-worker
    success "agent-worker: SESSION_SECRET"
  fi

  # radar-worker Secrets (4개)
  info "radar-worker Secrets (4개)..."
  for SECRET_NAME in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_AI_API_KEY CRON_SECRET; do
    if [[ -n "${!SECRET_NAME:-}" ]]; then
      echo "${!SECRET_NAME}" | npx wrangler secret put "$SECRET_NAME" --name radar-worker
      success "radar-worker: $SECRET_NAME"
    else
      warn "radar-worker: $SECRET_NAME 미설정 — 건너뜀"
    fi
  done

  # collab-worker Secrets (3개)
  info "collab-worker Secrets (3개)..."
  for SECRET_NAME in ANTHROPIC_API_KEY OPENAI_API_KEY CRON_SECRET; do
    if [[ -n "${!SECRET_NAME:-}" ]]; then
      echo "${!SECRET_NAME}" | npx wrangler secret put "$SECRET_NAME" --name collab-worker
      success "collab-worker: $SECRET_NAME"
    else
      warn "collab-worker: $SECRET_NAME 미설정 — 건너뜀"
    fi
  done

  # venture-worker Secrets (2개)
  info "venture-worker Secrets (2개)..."
  for SECRET_NAME in ANTHROPIC_API_KEY CRON_SECRET; do
    if [[ -n "${!SECRET_NAME:-}" ]]; then
      echo "${!SECRET_NAME}" | npx wrangler secret put "$SECRET_NAME" --name venture-worker
      success "venture-worker: $SECRET_NAME"
    else
      warn "venture-worker: $SECRET_NAME 미설정 — 건너뜀"
    fi
  done

  # ── 2.8 Feature Flags 안내 ──
  echo ""
  warn "2.8 Feature Flags — Cloudflare Dashboard에서 수동 설정이 필요해요:"
  info "Pages → discovery-x → Settings → Environment variables"
  echo ""
  echo "  FF_GRAPH_LAYER=true"
  echo "  FF_AGENT_DO=true"
  echo "  FF_TOPIC_COLLAB=true"
  echo "  FF_ACL_SCOPE=true"
  echo "  FF_MEMORY_LIFECYCLE=true"
  echo "  FF_VECTORIZE_SEARCH=true"
  echo "  FF_PIPELINE_BRIDGE=true"
  echo "  FF_COLLAB_WORKER=true"
  echo "  FF_PROFILE_LEARNER=true"
  echo "  FF_SIMPLIFIED_NAV=true"
  echo "  FF_AI_FALLBACK=true"
  echo "  FF_REQUIREMENTS_AGENT=true"
  echo "  CF_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID_NEW"
  echo "  AGENT_WORKER_URL=https://agent-worker.dx.minu.best"
  echo ""

  # ── Phase 2 검증 ──
  info "Phase 2 검증..."

  info "D1 테이블 수..."
  npx wrangler d1 execute discovery-x-db --remote \
    --command "SELECT count(*) FROM sqlite_master WHERE type='table';"

  info "Vectorize 인덱스 수..."
  local vect_count
  vect_count=$(npx wrangler vectorize list 2>/dev/null | grep -c "dx-" || echo "0")
  info "Vectorize 인덱스: ${vect_count}개 (기대: 6)"

  info "Workers 배포 확인..."
  npx wrangler deployments list --name agent-worker 2>/dev/null | head -3

  echo ""
  success "Phase 2 완료!"
  info "롤백: git checkout -- wrangler.toml agent-worker/wrangler.toml radar-worker/wrangler.toml collab-worker/wrangler.toml venture-worker/wrangler.toml"
}

# ═══════════════════════════════════════════════════
# Phase 3: DNS 이전
# ═══════════════════════════════════════════════════
phase3() {
  header "Phase 3: DNS 이전"

  # ── 3.2 Step 1: DNS 백업 ──
  confirm "3.2 Step 1: 기존 DNS 레코드를 백업할까요?"

  info "기존 DNS 레코드 백업..."

  if [[ -z "${CLOUDFLARE_API_TOKEN_OLD:-}" ]]; then
    warn "CLOUDFLARE_API_TOKEN_OLD 미설정 — 기존 CF 계정 API 토큰이 필요해요."
    read -r -p "$(echo -e "${YELLOW}기존 CF API Token: ${NC}")" CLOUDFLARE_API_TOKEN_OLD
  fi

  local zone_id_old
  zone_id_old=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=minu.best" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_OLD" \
    -H "Content-Type: application/json" | jq -r '.result[0].id')

  if [[ "$zone_id_old" == "null" || -z "$zone_id_old" ]]; then
    error "minu.best Zone ID를 가져올 수 없어요. API Token을 확인하세요."
    exit 1
  fi
  success "Zone ID (old): $zone_id_old"

  curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$zone_id_old/dns_records?per_page=100" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_OLD" \
    -H "Content-Type: application/json" > /tmp/dns-backup.json

  local dns_count
  dns_count=$(jq '.result | length' /tmp/dns-backup.json)
  success "DNS 레코드 백업 완료: ${dns_count}개 → /tmp/dns-backup.json"

  # ── Step 2~3: 수동 단계 안내 ──
  echo ""
  warn "━━━ 수동 작업이 필요해요 ━━━"
  echo ""
  info "Step 2: 새 계정에 도메인 추가"
  echo "  1. Cloudflare Dashboard (ktds.axbd@gmail.com) 로그인"
  echo "  2. Add a site → minu.best → Free plan"
  echo "  3. 지시된 nameserver 2개를 기록하세요"
  echo ""
  info "Step 3: Nameserver 변경"
  echo "  1. 도메인 레지스트라(minu.best 구매처) 접속"
  echo "  2. Nameserver를 새 CF 계정 nameserver로 변경"
  echo "  3. 전파 대기 (최대 48시간, 보통 1~6시간)"
  echo ""

  # ── Step 4: DNS 레코드 재생성 ──
  confirm "Step 4: DNS 레코드를 재생성할까요? (Nameserver 전파 완료 후)"

  require_env "CLOUDFLARE_API_TOKEN_NEW"

  local zone_id_new
  read -r -p "$(echo -e "${YELLOW}새 계정의 minu.best Zone ID: ${NC}")" zone_id_new
  if [[ -z "$zone_id_new" ]]; then
    error "Zone ID가 필요해요."
    exit 1
  fi

  info "Step 4: DNS 레코드 재생성..."

  # Pages custom domain (dx.minu.best)
  info "dx.minu.best CNAME 생성..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$zone_id_new/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_NEW" \
    -H "Content-Type: application/json" \
    -d '{"type":"CNAME","name":"dx","content":"discovery-x.pages.dev","proxied":true}' | jq '.success'

  # Worker custom domain (agent-worker.dx.minu.best)
  info "agent-worker.dx.minu.best CNAME 생성..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$zone_id_new/dns_records" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_NEW" \
    -H "Content-Type: application/json" \
    -d '{"type":"CNAME","name":"agent-worker.dx","content":"agent-worker.dx-workers.workers.dev","proxied":true}' | jq '.success'

  # ── Step 5 안내 ──
  echo ""
  warn "Step 5: Custom Domain 연결 — Dashboard에서 수동 설정 필요"
  echo "  Pages → discovery-x → Custom domains → Add → dx.minu.best"
  echo "  Workers → agent-worker → Triggers → Custom Domains → Add → agent-worker.dx.minu.best"
  echo ""

  # ── Phase 3 검증 ──
  confirm "Phase 3 검증을 실행할까요? (DNS 전파 완료 후)"

  info "DNS 전파 확인..."
  echo -n "  dx.minu.best: "
  dig dx.minu.best +short 2>/dev/null || warn "dig 미설치"
  echo -n "  agent-worker.dx.minu.best: "
  dig agent-worker.dx.minu.best +short 2>/dev/null || warn "dig 미설치"

  info "HTTPS 접근 확인..."
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" https://dx.minu.best 2>/dev/null || echo "000")
  if [[ "$http_code" == "200" ]]; then
    success "dx.minu.best → HTTP $http_code"
  else
    warn "dx.minu.best → HTTP $http_code (아직 전파 중일 수 있어요)"
  fi

  http_code=$(curl -s -o /dev/null -w "%{http_code}" https://agent-worker.dx.minu.best/health 2>/dev/null || echo "000")
  if [[ "$http_code" == "200" ]]; then
    success "agent-worker.dx.minu.best/health → HTTP $http_code"
  else
    warn "agent-worker.dx.minu.best/health → HTTP $http_code"
  fi

  echo ""
  success "Phase 3 완료!"
  info "롤백: 레지스트라에서 기존 CF 계정 nameserver로 복원"
}

# ═══════════════════════════════════════════════════
# Phase 4: 외부 서비스 체크리스트 출력
# ═══════════════════════════════════════════════════
phase4() {
  header "Phase 4: 외부 서비스 재설정 체크리스트"

  echo -e "${BOLD}4.1 AI API 키${NC}"
  echo "┌─────────────┬──────────────────────────────────────────────┬─────────────────────┐"
  echo "│ 서비스      │ 발급 URL                                     │ 환경변수            │"
  echo "├─────────────┼──────────────────────────────────────────────┼─────────────────────┤"
  echo "│ Anthropic   │ https://console.anthropic.com/settings/keys  │ ANTHROPIC_API_KEY   │"
  echo "│ OpenAI      │ https://platform.openai.com/api-keys         │ OPENAI_API_KEY      │"
  echo "│ Google AI   │ https://aistudio.google.com/apikey            │ GOOGLE_AI_API_KEY   │"
  echo "│ DeepSeek    │ https://platform.deepseek.com/api_keys        │ DEEPSEEK_API_KEY    │"
  echo "└─────────────┴──────────────────────────────────────────────┴─────────────────────┘"
  echo ""
  info "새 조직 계정으로 발급하거나 기존 키를 공유할 수 있어요."
  info "비용 분리가 필요하면 새 키를 발급하세요."
  echo ""

  echo -e "${BOLD}4.2 Google OAuth${NC}"
  echo "  D2(도메인 유지) 결정으로 redirect URI 동일 → 기존 OAuth 앱 그대로 사용 가능"
  echo "  OAuth 앱 이전이 필요하면:"
  echo "    1. https://console.cloud.google.com → 새 프로젝트 생성"
  echo "    2. OAuth 2.0 Client ID 생성"
  echo "    3. Authorized redirect URIs: https://dx.minu.best/auth/google/callback"
  echo "    4. GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 갱신"
  echo ""

  echo -e "${BOLD}4.3 Resend 이메일${NC}"
  echo "    1. https://resend.com → 새 계정 or 기존 계정에 도메인 추가"
  echo "    2. ideaonaction.ai 도메인 DNS 검증 (또는 minu.best 서브도메인)"
  echo "    3. API Key 발급 → RESEND_API_KEY 갱신"
  echo ""

  echo -e "${BOLD}4.4 cron-job.org${NC}"
  echo "  도메인 동일(dx.minu.best) → URL 변경 불필요"
  echo "  CRON_SECRET 값이 변경되면 cron-job.org 각 Job의 URL 쿼리파라미터 갱신 필요"
  echo ""
  echo "┌────┬──────────────────────────────┬─────────────┬──────────┐"
  echo "│ #  │ 엔드포인트                    │ 주기        │ 변경필요 │"
  echo "├────┼──────────────────────────────┼─────────────┼──────────┤"
  echo "│  1 │ /api/cron/daily              │ 매일 00:00  │    ❌    │"
  echo "│  2 │ /api/cron/weekly-summary     │ 매주 월     │    ❌    │"
  echo "│ 3+ │ 나머지 11개                  │ 다양        │    ❌    │"
  echo "└────┴──────────────────────────────┴─────────────┴──────────┘"
  echo ""

  success "Phase 4 체크리스트 출력 완료! 위 항목을 수동으로 확인하세요."
}

# ═══════════════════════════════════════════════════
# all — Phase 1~4 순차 실행
# ═══════════════════════════════════════════════════
phase_all() {
  header "Phase 1~4 순차 실행"
  confirm "Phase 1~4를 순차적으로 실행할까요?"

  phase1
  echo ""
  confirm "Phase 1 완료. Phase 2로 진행할까요?"

  phase2
  echo ""
  confirm "Phase 2 완료. Phase 3으로 진행할까요?"

  phase3
  echo ""
  confirm "Phase 3 완료. Phase 4로 진행할까요?"

  phase4

  echo ""
  header "전체 완료"
  success "Phase 1~4 실행 완료!"
  info "Phase 5(데이터 마이그레이션) + Phase 6(통합 검증)은 별도 실행이 필요해요."
}

# ═══════════════════════════════════════════════════
# 메인 — 서브커맨드 라우팅
# ═══════════════════════════════════════════════════
usage() {
  echo -e "${BOLD}F51 Infrastructure Migration Script${NC}"
  echo -e "DX-DSGN-021 Phase 1~4 실행 스크립트\n"
  echo "Usage: bash scripts/f51-migrate.sh <command>"
  echo ""
  echo "Commands:"
  echo "  check   전제 조건 확인 (P1~P7)"
  echo "  phase1  GitHub Transfer 후속 작업 (Secrets, remote, Project)"
  echo "  phase2  Cloudflare 리소스 생성 (D1, Vectorize, Workers, Secrets)"
  echo "  phase3  DNS 이전 (DNS 백업, 레코드 생성)"
  echo "  phase4  외부 서비스 체크리스트 출력"
  echo "  all     Phase 1~4 순차 실행"
}

case "${1:-}" in
  check)  phase_check ;;
  phase1) phase1 ;;
  phase2) phase2 ;;
  phase3) phase3 ;;
  phase4) phase4 ;;
  all)    phase_all ;;
  *)
    usage
    exit 1
    ;;
esac
