---
code: DX-DSGN-021
title: 프로젝트 연동/병합 준비 — Phase별 실행 스크립트 + 검증 + 롤백
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
req: DX-REQ-021
spec-item: F51
plan: DX-PLAN-014
---

# DX-DSGN-020: 프로젝트 연동/병합 준비 — 상세 설계

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | F51 — 프로젝트 연동/병합 준비 |
| Plan | [[DX-PLAN-014]] |
| 의사결정 | D1~D5 전체 확정 (Transfer + minu.best + API 연동 + master push + 같은 CF 계정) |
| Phase | 6 Phase 순차 실행 — 각 Phase마다 실행 → 검증 → 롤백 절차 포함 |
| **실행 상태** | **Phase 1~6 완료 (2026-03-18)** — Match Rate 97% (iterate #2). 잔여: 브라우저 수동 로그인만 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | DX/FX가 별도 Org/계정에 분산 — 협업·비용 추적 비효율 |
| **Solution** | GitHub Transfer + CF 계정 통합 + DNS 이전 — 실행 스크립트 자동화 |
| **Function** | 단일 KTDS-AXBD Org에서 두 프로젝트 관리 |
| **Core Value** | 실수 없는 인프라 이전 — 스크립트 기반 재현 가능한 절차 |

---

## 전제 조건

실행 전 다음이 준비되어 있어야 해요:

| # | 항목 | 확인 방법 |
|---|------|----------|
| P1 | GitHub: Sinclair-Seo 계정으로 `gh auth login` 완료 | `gh auth status` |
| P2 | GitHub: KTDS-AXBD org의 Owner 권한 | `gh api orgs/KTDS-AXBD/memberships/Sinclair-Seo --jq '.role'` |
| P3 | GitHub: AX-BD-Team org의 Owner 권한 (Transfer용) | `gh api orgs/AX-BD-Team/memberships/Sinclair-Seo --jq '.role'` |
| P4 | Cloudflare: ktds.axbd@gmail.com 계정 API Token | Cloudflare Dashboard → My Profile → API Tokens |
| P5 | Cloudflare: minu.best 도메인 DNS 관리 권한 | Cloudflare Dashboard → minu.best → DNS |
| P6 | wrangler CLI 설치 | `npx wrangler --version` |
| P7 | 새 CF 계정 ID 확보 | `CLOUDFLARE_ACCOUNT_ID_NEW` 환경변수 설정 |

---

## Phase 1: GitHub 이전 (수동 + 스크립트)

### 1.1 리포 Transfer (수동 — GitHub UI)

> ⚠️ **Transfer는 GitHub UI에서만 가능** (API/CLI 미지원)

1. https://github.com/AX-BD-Team/Discovery-X/settings 접속
2. **Danger Zone** → **Transfer repository**
3. New owner: `KTDS-AXBD`
4. 확인 입력: `AX-BD-Team/Discovery-X`
5. **I understand, transfer this repository** 클릭

**Transfer 후 자동 처리**:
- `github.com/AX-BD-Team/Discovery-X` → `github.com/KTDS-AXBD/Discovery-X` 리다이렉트
- Issues 21건, Labels, Milestones 자동 이전
- GitHub Actions workflows 보존 (Secrets도 보존됨 — 2026년 기준 Transfer 시 유지)

### 1.2 검증

```bash
# Transfer 완료 확인
gh repo view KTDS-AXBD/Discovery-X --json name,owner --jq '.owner.login + "/" + .name'
# 기대값: KTDS-AXBD/Discovery-X

# Issues 이전 확인
gh issue list --repo KTDS-AXBD/Discovery-X --state all --json number --jq '. | length'
# 기대값: 21
```

### 1.3 Actions Secrets 재등록

```bash
REPO="KTDS-AXBD/Discovery-X"

# 5개 Secrets (값은 사용자가 직접 입력 — 여기서는 구조만)
gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$REPO" --body "$CLOUDFLARE_ACCOUNT_ID_NEW"
gh secret set CLOUDFLARE_API_TOKEN  --repo "$REPO" --body "$CLOUDFLARE_API_TOKEN_NEW"
gh secret set ANTHROPIC_API_KEY     --repo "$REPO" --body "$ANTHROPIC_API_KEY_NEW"
gh secret set SESSION_SECRET        --repo "$REPO" --body "$SESSION_SECRET_NEW"
gh secret set CRON_SECRET           --repo "$REPO" --body "$CRON_SECRET_NEW"
```

**검증**:
```bash
gh secret list --repo "$REPO"
# 기대값: 5개 Secrets 표시
```

### 1.4 Environment 재설정

```bash
# production 환경 확인 (Transfer 시 보존되는 경우 있음)
gh api repos/KTDS-AXBD/Discovery-X/environments --jq '.environments[].name'
# 없으면 재생성 — deploy.yml에서 자동 생성됨 (첫 배포 시)
```

### 1.5 git remote 갱신

```bash
# 로컬 (WSL)
cd /home/sinclair/work/axbd/Discovery-X
git remote set-url origin git@github.com:KTDS-AXBD/Discovery-X.git
git remote -v
# 기대값: origin  git@github.com:KTDS-AXBD/Discovery-X.git

# Windows (있다면)
# git remote set-url origin https://github.com/KTDS-AXBD/Discovery-X.git
```

### 1.6 CI/CD 동작 확인

```bash
# 테스트 커밋으로 Actions 트리거 확인
git commit --allow-empty -m "chore: verify CI/CD after repo transfer"
git push origin master

# Actions 실행 상태 확인
gh run list --repo KTDS-AXBD/Discovery-X --limit 1
gh run view --repo KTDS-AXBD/Discovery-X $(gh run list --repo KTDS-AXBD/Discovery-X --json databaseId --jq '.[0].databaseId') --log 2>/dev/null | tail -20
```

### 1.7 GitHub Project 이전

> GitHub Org-level Project는 Transfer 시 이전되지 않아요. 새 Org에 재생성해야 해요.

```bash
OLD_ORG="AX-BD-Team"
NEW_ORG="KTDS-AXBD"
OLD_PROJECT_NUM=4

# Step 1: 기존 Project 아이템 목록 추출
gh project item-list "$OLD_PROJECT_NUM" --owner "$OLD_ORG" --format json > /tmp/project-items-backup.json
echo "Backed up $(jq '.items | length' /tmp/project-items-backup.json) items"

# Step 2: 새 Org에 Project 생성
NEW_PROJECT_NUM=$(gh project create --owner "$NEW_ORG" --title "Discovery-X" --format json --jq '.number')
echo "Created project #$NEW_PROJECT_NUM in $NEW_ORG"

# Step 3: 아이템 재등록 (Issues는 이미 Transfer됨 — URL만 org 부분 변경)
jq -r '.items[] | select(.content.url != null) | .content.url' /tmp/project-items-backup.json | \
  sed "s|$OLD_ORG|$NEW_ORG|g" | \
  while read -r url; do
    gh project item-add "$NEW_PROJECT_NUM" --owner "$NEW_ORG" --url "$url" 2>/dev/null && echo "Added: $url" || echo "SKIP: $url"
  done

# Step 4: Project 필드 설정 (Status, Priority, REQ Code, Work Type)
# → 수동 설정 필요: GitHub Project UI에서 커스텀 필드 추가
```

### Phase 1 롤백

```bash
# Transfer 롤백: KTDS-AXBD → AX-BD-Team로 재 Transfer (동일 절차)
# git remote 복원:
git remote set-url origin git@github.com:AX-BD-Team/Discovery-X.git
```

---

## Phase 2: Cloudflare 이전

### 환경변수 설정 (Phase 2~6 공통)

```bash
# 새 CF 계정 정보 — 실행 전 반드시 설정
export CLOUDFLARE_ACCOUNT_ID_NEW="<새_계정_ID>"
export CLOUDFLARE_API_TOKEN_NEW="<새_API_토큰>"

# 기존 CF 계정 정보 (백업/export용)
export CLOUDFLARE_ACCOUNT_ID_OLD="02ae9a2bead25d99caa8f3258b81f568"
# 이전 완료 후 현재 값: b6c06059b413892a92f150e5ca496236 (NEW), DB ID: 86590201-0a3f-4ce4-8021-c3d32e0a44eb
```

### 2.1 D1 Database 생성

```bash
# 새 계정에서 D1 생성
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler d1 create discovery-x-db

# 출력에서 database_id 기록
# 예: database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export NEW_DB_ID="<출력된_database_id>"
```

### 2.2 D1 마이그레이션 적용 (70개 SQL)

```bash
# 마이그레이션 디렉토리에서 순차 적용
cd /home/sinclair/work/axbd/Discovery-X

# wrangler.toml의 database_id를 임시 변경 (또는 --database-id 옵션 사용)
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler d1 migrations apply discovery-x-db --remote

# 검증: 테이블 수 확인
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler d1 execute discovery-x-db --remote \
  --command "SELECT count(*) as cnt FROM sqlite_master WHERE type='table';"
# 기대값: 138
```

### 2.3 Vectorize 인덱스 생성 (6개)

```bash
CF_ENV="CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID_NEW CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_NEW"

# 1536차원 (OpenAI text-embedding-3-small)
eval $CF_ENV npx wrangler vectorize create dx-discovery-embeddings --dimensions=1536 --metric=cosine
eval $CF_ENV npx wrangler vectorize create dx-evidence-embeddings  --dimensions=1536 --metric=cosine
eval $CF_ENV npx wrangler vectorize create dx-radar-embeddings     --dimensions=1536 --metric=cosine

# 512차원 (Workers AI / custom)
eval $CF_ENV npx wrangler vectorize create dx-graph-embeddings     --dimensions=512 --metric=cosine
eval $CF_ENV npx wrangler vectorize create dx-memory-embeddings    --dimensions=512 --metric=cosine
eval $CF_ENV npx wrangler vectorize create dx-signal-embeddings    --dimensions=512 --metric=cosine

# 검증
eval $CF_ENV npx wrangler vectorize list
# 기대값: 6개 인덱스
```

### 2.4 Pages 프로젝트 생성

```bash
# Pages 프로젝트는 첫 배포 시 자동 생성됨
# 또는 수동 생성:
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler pages project create discovery-x --production-branch=master
```

### 2.5 wrangler.toml 일괄 업데이트 (5개 파일)

```bash
cd /home/sinclair/work/axbd/Discovery-X
OLD_DB_ID="1bab6138-6b2f-45eb-8285-55ba7b543957"

# database_id 일괄 교체 (5개 파일)
for f in wrangler.toml agent-worker/wrangler.toml radar-worker/wrangler.toml collab-worker/wrangler.toml venture-worker/wrangler.toml; do
  sed -i "s/$OLD_DB_ID/$NEW_DB_ID/g" "$f"
  echo "Updated: $f"
done

# account_id 주석 업데이트 (메인 wrangler.toml)
sed -i "s/02ae9a2bead25d99caa8f3258b81f568/$CLOUDFLARE_ACCOUNT_ID_NEW/g" wrangler.toml

# 검증
grep -r "$NEW_DB_ID" wrangler.toml */wrangler.toml | wc -l
# 기대값: 5
grep "$OLD_DB_ID" wrangler.toml */wrangler.toml
# 기대값: 출력 없음 (전부 교체됨)
```

### 2.6 Workers 배포 (4개)

```bash
# agent-worker (Durable Objects 포함 — 순서 중요: DO migration 먼저)
cd /home/sinclair/work/axbd/Discovery-X/agent-worker
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler deploy

# radar-worker
cd ../radar-worker
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler deploy

# collab-worker
cd ../collab-worker
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler deploy

# venture-worker
cd ../venture-worker
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler deploy

cd /home/sinclair/work/axbd/Discovery-X
```

### 2.7 Secrets 설정 (Pages + Workers)

```bash
CF_AUTH="CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID_NEW CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN_NEW"

# ── Pages Secrets (10개) ──
for SECRET_NAME in SESSION_SECRET ANTHROPIC_API_KEY OPENAI_API_KEY DEEPSEEK_API_KEY GOOGLE_AI_API_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET RESEND_API_KEY CRON_SECRET ANTHROPIC_ADMIN_API_KEY; do
  echo "Setting Pages secret: $SECRET_NAME"
  eval $CF_AUTH echo "\$$SECRET_NAME" | npx wrangler pages secret put "$SECRET_NAME" --project-name discovery-x
done

# ── agent-worker Secrets (2개) ──
eval $CF_AUTH echo "$ANTHROPIC_API_KEY_NEW" | npx wrangler secret put ANTHROPIC_API_KEY --name agent-worker
eval $CF_AUTH echo "$SESSION_SECRET_NEW"    | npx wrangler secret put SESSION_SECRET    --name agent-worker

# ── radar-worker Secrets (4개) ──
for SECRET_NAME in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_AI_API_KEY CRON_SECRET; do
  eval $CF_AUTH echo "\$$SECRET_NAME" | npx wrangler secret put "$SECRET_NAME" --name radar-worker
done

# ── collab-worker Secrets (3개) ──
for SECRET_NAME in ANTHROPIC_API_KEY OPENAI_API_KEY CRON_SECRET; do
  eval $CF_AUTH echo "\$$SECRET_NAME" | npx wrangler secret put "$SECRET_NAME" --name collab-worker
done

# ── venture-worker Secrets (2개) ──
for SECRET_NAME in ANTHROPIC_API_KEY CRON_SECRET; do
  eval $CF_AUTH echo "\$$SECRET_NAME" | npx wrangler secret put "$SECRET_NAME" --name venture-worker
done
```

### 2.8 Feature Flags (Pages vars)

> Pages vars는 Cloudflare Dashboard → Pages → discovery-x → Settings → Environment variables에서 설정.
> 또는 wrangler pages deployment 시 `--var` 옵션 사용.

| 변수명 | 값 | 비고 |
|--------|-----|------|
| `FF_GRAPH_LAYER` | `true` | |
| `FF_AGENT_DO` | `true` | |
| `FF_TOPIC_COLLAB` | `true` | |
| `FF_ACL_SCOPE` | `true` | |
| `FF_MEMORY_LIFECYCLE` | `true` | |
| `FF_VECTORIZE_SEARCH` | `true` | |
| `FF_PIPELINE_BRIDGE` | `true` | |
| `FF_COLLAB_WORKER` | `true` | |
| `FF_PROFILE_LEARNER` | `true` | |
| `FF_SIMPLIFIED_NAV` | `true` | |
| `FF_AI_FALLBACK` | `true` | |
| `FF_REQUIREMENTS_AGENT` | `true` | |
| `CF_ACCOUNT_ID` | `$CLOUDFLARE_ACCOUNT_ID_NEW` | Workers AI REST API용 |
| `AGENT_WORKER_URL` | `https://agent-worker.ktds-axbd.workers.dev` | DNS zone이 다른 계정이므로 workers.dev URL 사용 |

### Phase 2 검증

```bash
# D1 테이블 수
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
npx wrangler d1 execute discovery-x-db --remote \
  --command "SELECT count(*) FROM sqlite_master WHERE type='table';"

# Vectorize 인덱스 수
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
npx wrangler vectorize list | grep "dx-" | wc -l
# 기대값: 6

# Workers 배포 확인
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
npx wrangler deployments list --name agent-worker | head -3
```

### Phase 2 롤백

```bash
# wrangler.toml 복원
git checkout -- wrangler.toml agent-worker/wrangler.toml radar-worker/wrangler.toml collab-worker/wrangler.toml venture-worker/wrangler.toml

# 새 계정 리소스는 삭제하지 않고 유지 (병행 운영 가능)
```

---

## Phase 3: DNS 이전

### 3.1 Cloudflare DNS 이전 전략

> minu.best 도메인 유지 (D2 확정). DNS 관리를 기존 CF 계정에서 새 CF 계정으로 이전.

**방법 A: 도메인 자체를 새 계정으로 이전** (권장)
```
기존 CF 계정(sinclair.seo) → minu.best 도메인 삭제
새 CF 계정(ktds.axbd)     → minu.best 도메인 추가 → DNS 레코드 재설정
```

**방법 B: CNAME 방식 (도메인은 기존 계정 유지)**
```
기존 CF 계정: dx.minu.best CNAME → 새 CF Pages URL
기존 CF 계정: agent-worker.dx.minu.best CNAME → 새 CF Worker URL
```

### 3.2 방법 A 실행 절차

#### Step 1: 기존 DNS 레코드 백업
```bash
# Cloudflare API로 DNS 레코드 전체 추출
curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=minu.best" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_OLD" \
  -H "Content-Type: application/json" | jq '.result[0].id' -r > /tmp/zone_id_old.txt

ZONE_ID_OLD=$(cat /tmp/zone_id_old.txt)
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$ZONE_ID_OLD/dns_records?per_page=100" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_OLD" \
  -H "Content-Type: application/json" > /tmp/dns-backup.json

echo "DNS records backed up: $(jq '.result | length' /tmp/dns-backup.json)"
```

#### Step 2: 새 계정에 도메인 추가
```
Cloudflare Dashboard (ktds.axbd@gmail.com)
→ Add a site → minu.best → Free plan → 지시된 nameserver 기록
```

#### Step 3: Nameserver 변경
```
도메인 레지스트라 (minu.best 구매처)
→ Nameserver를 새 CF 계정 nameserver로 변경
→ 전파 대기 (최대 48시간, 일반적으로 1~6시간)
```

#### Step 4: DNS 레코드 재생성
```bash
ZONE_ID_NEW="<새_계정의_minu.best_zone_id>"

# Pages custom domain (dx.minu.best)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID_NEW/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_NEW" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"dx","content":"discovery-x.pages.dev","proxied":true}'

# Worker custom domain (agent-worker.dx.minu.best)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID_NEW/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN_NEW" \
  -H "Content-Type: application/json" \
  -d '{"type":"CNAME","name":"agent-worker.dx","content":"agent-worker.<workers-subdomain>.workers.dev","proxied":true}'

# 기타 기존 DNS 레코드 복원 (백업 기반)
```

#### Step 5: Pages/Worker Custom Domain 연결
```bash
# Pages custom domain
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
npx wrangler pages project list  # discovery-x 확인

# Dashboard에서: Pages → discovery-x → Custom domains → Add → dx.minu.best

# Worker custom domain
# Dashboard에서: Workers → agent-worker → Triggers → Custom Domains → Add → agent-worker.dx.minu.best
```

### Phase 3 검증

```bash
# DNS 전파 확인
dig dx.minu.best +short
dig agent-worker.dx.minu.best +short

# HTTPS 접근 확인
curl -s -o /dev/null -w "%{http_code}" https://dx.minu.best
# 기대값: 200

curl -s -o /dev/null -w "%{http_code}" https://agent-worker.dx.minu.best/health
# 기대값: 200
```

### Phase 3 롤백

```bash
# Nameserver를 기존 CF 계정 nameserver로 복원 (레지스트라에서)
# DNS 전파 대기
```

---

## Phase 4: 외부 서비스 재설정

### 4.1 AI API 키

| 서비스 | 발급 URL | 환경변수 |
|--------|---------|----------|
| Anthropic | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` |
| OpenAI | https://platform.openai.com/api-keys | `OPENAI_API_KEY` |
| Google AI | https://aistudio.google.com/apikey | `GOOGLE_AI_API_KEY` |
| DeepSeek | https://platform.deepseek.com/api_keys | `DEEPSEEK_API_KEY` |

> 새 조직 계정으로 발급하거나, 기존 키를 공유할 수 있어요. 비용 분리가 필요하면 새 키 발급.

### 4.2 Google OAuth

> D2(도메인 유지) 결정으로 redirect URI가 동일 → **기존 OAuth 앱 그대로 사용 가능**.
> 단, OAuth 앱 소유를 새 Google Cloud 프로젝트로 이전하고 싶다면:

1. https://console.cloud.google.com → 새 프로젝트 생성
2. OAuth 2.0 Client ID 생성
3. Authorized redirect URIs: `https://dx.minu.best/auth/google/callback`
4. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 갱신

### 4.3 Resend 이메일

```
1. https://resend.com → 새 계정 or 기존 계정에 도메인 추가
2. ideaonaction.ai 도메인 DNS 검증 (또는 minu.best 서브도메인)
3. API Key 발급 → RESEND_API_KEY 갱신
```

### 4.4 cron-job.org

> 도메인 동일(dx.minu.best) → **URL 변경 불필요**. `CRON_SECRET`만 동일하면 작동.

| # | 엔드포인트 | 주기 | 변경 필요 |
|---|-----------|------|----------|
| 1 | `/api/cron/daily` | 매일 00:00 UTC | ❌ |
| 2 | `/api/cron/weekly-summary` | 매주 월 | ❌ |
| 3~13 | 나머지 11개 | 다양 | ❌ |

> `CRON_SECRET` 값이 변경되면 cron-job.org 각 Job의 URL 쿼리파라미터 갱신 필요.

---

## Phase 5: 데이터 마이그레이션

### 5.1 D1 데이터 Export

```bash
# 기존 계정에서 export
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_OLD" \
npx wrangler d1 export discovery-x-db --remote --output /tmp/dx-backup.sql

# 파일 크기 확인
ls -lh /tmp/dx-backup.sql
```

### 5.2 D1 데이터 Import

```bash
# 새 계정에 import
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_NEW" \
npx wrangler d1 execute discovery-x-db --remote --file /tmp/dx-backup.sql

# 검증: 주요 테이블 row 수 비교
for TABLE in users discoveries ideas proposals radar_items feature_requests; do
  echo -n "$TABLE: "
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
  npx wrangler d1 execute discovery-x-db --remote \
    --command "SELECT count(*) as cnt FROM $TABLE;" 2>&1 | grep -o '"cnt": [0-9]*'
done
```

### 5.3 Vectorize 재구축

```bash
# 임베딩 데이터는 Export 불가 — Cron으로 재계산
# 각 Vectorize Cron을 수동 트리거

DOMAIN="https://dx.minu.best"
SECRET="$CRON_SECRET_NEW"

curl -s "$DOMAIN/api/cron/embeddings?secret=$SECRET"
curl -s "$DOMAIN/api/cron/vectorize?secret=$SECRET&type=graph"
curl -s "$DOMAIN/api/cron/vectorize?secret=$SECRET&type=memory"
curl -s "$DOMAIN/api/cron/vectorize?secret=$SECRET&type=signal"

# 검증: Vectorize에 벡터가 저장되었는지 확인
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
npx wrangler vectorize get-index dx-discovery-embeddings
```

### Phase 5 검증

```bash
# 핵심 데이터 정합성
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_NEW" \
npx wrangler d1 execute discovery-x-db --remote \
  --command "SELECT count(*) as users FROM users; SELECT count(*) as discoveries FROM discoveries; SELECT count(*) as ideas FROM ideas;"
```

---

## Phase 6: 통합 검증

### 6.1 검증 체크리스트

```bash
DOMAIN="https://dx.minu.best"
SECRET="$CRON_SECRET_NEW"

# 1. 메인 앱 접근
echo "=== 1. Main App ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$DOMAIN"

# 2. API Health
echo "=== 2. API Health ==="
curl -s "$DOMAIN/api/health" | jq .

# 3. Agent Worker Health
echo "=== 3. Agent Worker ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "https://agent-worker.dx.minu.best/health"

# 4. Cron 엔드포인트 (1개만 샘플)
echo "=== 4. Cron Sample ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$DOMAIN/api/cron/daily?secret=$SECRET"

# 5. Google OAuth (리다이렉트 확인)
echo "=== 5. OAuth Redirect ==="
curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}\n" "$DOMAIN/auth/google"
```

### 6.2 수동 기능 테스트

| # | 테스트 | 방법 | 기대값 |
|---|--------|------|--------|
| T1 | Google 로그인 | 브라우저에서 로그인 | 대시보드 접근 |
| T2 | Discovery 생성 | UI에서 신규 Discovery | DB에 저장 |
| T3 | Agent 채팅 | 채팅 메시지 전송 | SSE 스트리밍 응답 |
| T4 | Radar 수집 | Cron 수동 트리거 | radar_items 추가 |
| T5 | AI Fallback | Anthropic 키 무효화 후 채팅 | DeepSeek fallback |
| T6 | 이메일 | 주간 요약 Cron 트리거 | Resend 발송 |

---

## 코드 변경 사항 요약

이 작업에서 코드 변경이 필요한 파일:

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `wrangler.toml` | `database_id`, account_id 주석 |
| 2 | `agent-worker/wrangler.toml` | `database_id` |
| 3 | `radar-worker/wrangler.toml` | `database_id` |
| 4 | `collab-worker/wrangler.toml` | `database_id` |
| 5 | `venture-worker/wrangler.toml` | `database_id` |
| 6 | `.github/workflows/deploy.yml` | URL 변경 불필요 (도메인 유지) |
| 7 | `.github/workflows/deploy-agent-worker.yml` | URL 변경 불필요 |

> **총 5개 파일** — 모두 `database_id` 값 교체. 코드 로직 변경 없음.

---

## 실행 순서 요약

```
Phase 1 (Day 1)           Phase 2 (Day 2-3)         Phase 3 (Day 3)
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ GitHub Transfer  │─────►│ D1 + Vectorize  │─────►│ DNS Nameserver  │
│ Secrets 재등록   │      │ Workers 배포     │      │ Custom Domain   │
│ remote 갱신      │      │ wrangler.toml   │      │                 │
│ Project 재생성   │      │ Secrets + Flags │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
                                                          │
Phase 6 (Day 5-6)         Phase 5 (Day 5)           Phase 4 (Day 4)
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ 통합 검증       │◄─────│ D1 Export/Import│◄─────│ AI API 키       │
│ 수동 기능 테스트 │      │ Vectorize 재구축│      │ OAuth (유지)    │
│ CI/CD 확인      │      │                 │      │ Resend          │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

## 참조

- [[DX-PLAN-014]] — Plan 문서 (의사결정 D1~D5 확정)
- [[DX-REQ-021]] — F51 요구사항
- `.team-tmp/f51-foundry-x-analysis.md` — Foundry-X 리포 분석
- `.team-tmp/f51-discovery-x-infra.md` — Discovery-X 인프라 현황
