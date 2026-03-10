#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# batch-runner.sh — claude -p 기반 배치 AI 분석 자동화
#
# 사용법: bash scripts/batch-runner.sh [radar|ontology|all]
# 환경변수:
#   DB_NAME          — D1 데이터베이스 이름 (기본: wrangler.toml에서 추출)
#   BATCH_SIZE       — 한 번에 처리할 아이템 수 (기본: 5)
#   RATE_LIMIT_WAIT  — claude -p 호출 간 대기 초 (기본: 30)
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

MODE="${1:-all}"
BATCH_SIZE="${BATCH_SIZE:-5}"
RATE_LIMIT_WAIT="${RATE_LIMIT_WAIT:-30}"

# DB 이름 자동 추출
if [[ -z "${DB_NAME:-}" ]]; then
  DB_NAME=$(grep 'database_name' wrangler.toml | head -1 | awk -F'"' '{print $2}')
fi

if [[ -z "$DB_NAME" ]]; then
  echo "[error] DB_NAME을 추출할 수 없어요. wrangler.toml을 확인하세요." >&2
  exit 1
fi

# 카운터
RADAR_PROCESSED=0
IDEAS_GENERATED=0
EVIDENCE_PROCESSED=0
NODES_CREATED=0
EDGES_CREATED=0
ERROR_COUNT=0

###############################################################################
# 유틸 함수
###############################################################################

log() { echo "[$(date +%H:%M:%S)] $*"; }
log_error() { echo "[$(date +%H:%M:%S)] [ERROR] $*" >&2; ERROR_COUNT=$((ERROR_COUNT + 1)); }

gen_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    cat /proc/sys/kernel/random/uuid
  fi
}

# SQL 문자열 이스케이프: 작은따옴표 → '', 줄바꿈 → 공백
sql_escape() {
  echo "$1" | tr '\n' ' ' | sed "s/'/''/g"
}

# wrangler d1 execute (재시도 1회)
d1_execute() {
  local sql="$1"
  local attempt=0
  local result=""
  while [[ $attempt -lt 2 ]]; do
    if result=$(npx wrangler d1 execute "$DB_NAME" --remote --command "$sql" --json 2>/dev/null); then
      echo "$result"
      return 0
    fi
    attempt=$((attempt + 1))
    if [[ $attempt -lt 2 ]]; then
      log "wrangler 재시도 중..."
      sleep 3
    fi
  done
  return 1
}

# d1 결과에서 results 배열 추출
d1_results() {
  echo "$1" | jq '.[0].results'
}

###############################################################################
# Radar 함수
###############################################################################

query_unprocessed_radar() {
  local raw
  raw=$(d1_execute "SELECT id, title, title_ko, summary, summary_ko, key_points, url, source_id FROM radar_items WHERE ai_processed_at IS NULL AND status IN ('COLLECTED', 'SCORED') LIMIT $BATCH_SIZE;") || return 1
  d1_results "$raw"
}

query_radar_tenant() {
  local raw
  raw=$(d1_execute "SELECT DISTINCT rs.tenant_id FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id WHERE ri.ai_processed_at IS NULL AND ri.status IN ('COLLECTED', 'SCORED') LIMIT 1;") || return 1
  d1_results "$raw" | jq -r '.[0].tenant_id // empty'
}

analyze_radar_batch() {
  local items_json="$1"
  local count
  count=$(echo "$items_json" | jq 'length')

  # 프롬프트 구성
  local prompt="다음 레이더 아이템들을 클러스터링하고 각 클러스터에서 아이디어를 생성하세요.

아이템:"

  for i in $(seq 0 $((count - 1))); do
    local id title summary
    id=$(echo "$items_json" | jq -r ".[$i].id")
    title=$(echo "$items_json" | jq -r ".[$i].title_ko // .[$i].title")
    summary=$(echo "$items_json" | jq -r ".[$i].summary_ko // .[$i].summary")
    prompt="$prompt
[$id] $title
$summary
---"
  done

  prompt="$prompt

JSON 형식으로만 응답:
{\"clusters\":[{\"topic\":\"...\",\"itemIds\":[\"id1\",\"id2\"],\"rationale\":\"...\",\"idea\":{\"title\":\"...\",\"summary\":\"...\",\"whyNow\":\"...\"}}]}"

  local result
  result=$(claude -p "$prompt" \
    --output-format json \
    --allowedTools "Read,Glob,Grep" \
    --max-turns 3 \
    --append-system-prompt "JSON만 출력하세요. 추가 설명 없이 순수 JSON만 반환하세요." \
    2>/dev/null) || return 1

  echo "$result" | jq -r '.result'
}

save_radar_results() {
  local analysis="$1"
  local tenant_id="$2"
  local clusters
  clusters=$(echo "$analysis" | jq -c '.clusters // []')
  local cluster_count
  cluster_count=$(echo "$clusters" | jq 'length')

  for i in $(seq 0 $((cluster_count - 1))); do
    local cluster
    cluster=$(echo "$clusters" | jq -c ".[$i]")

    local idea_title idea_summary item_ids
    idea_title=$(sql_escape "$(echo "$cluster" | jq -r '.idea.title')")
    idea_summary=$(sql_escape "$(echo "$cluster" | jq -r '.idea.summary')")
    item_ids=$(echo "$cluster" | jq -r '.itemIds[]')

    local idea_id="idea-$(gen_uuid)"

    # ideas INSERT
    if ! d1_execute "INSERT INTO ideas (id, tenant_id, owner_id, title, summary, status, created_by_agent, created_at, updated_at) VALUES ('$idea_id', '$tenant_id', 'system-agent', '$idea_title', '$idea_summary', 'ACTIVE', 1, unixepoch(), unixepoch());" >/dev/null; then
      log_error "idea INSERT 실패: $idea_title"
      continue
    fi
    IDEAS_GENERATED=$((IDEAS_GENERATED + 1))

    # idea_sources INSERT (클러스터 내 각 radar_item 연결)
    for rid in $item_ids; do
      local isrc_id="isrc-$(gen_uuid)"
      d1_execute "INSERT INTO idea_sources (id, idea_id, radar_item_id, added_at) VALUES ('$isrc_id', '$idea_id', '$rid', unixepoch());" >/dev/null 2>&1 || true
    done
  done
}

mark_radar_processed() {
  local items_json="$1"
  local ids
  ids=$(echo "$items_json" | jq -r '.[].id' | sed "s/.*/'&'/" | paste -sd,)
  if [[ -n "$ids" ]]; then
    d1_execute "UPDATE radar_items SET ai_processed_at = unixepoch() WHERE id IN ($ids);" >/dev/null || true
  fi
}

run_radar_mode() {
  log "=== Radar 모드 시작 ==="
  local tenant_id
  tenant_id=$(query_radar_tenant) || { log_error "tenant_id 조회 실패"; return; }
  if [[ -z "$tenant_id" ]]; then
    log "Radar 미처리 아이템이 없어요."
    return
  fi
  log "tenant_id: $tenant_id"

  while true; do
    local items
    items=$(query_unprocessed_radar) || { log_error "Radar 아이템 조회 실패"; break; }

    local count
    count=$(echo "$items" | jq 'length')
    if [[ "$count" -eq 0 ]]; then
      log "Radar 미처리 아이템 모두 처리 완료."
      break
    fi
    log "Radar 배치: $count 건 처리 중..."

    # claude -p 분석
    local analysis
    if ! analysis=$(analyze_radar_batch "$items"); then
      log_error "Radar 분석 실패 (claude -p). 배치 건너뜀."
      mark_radar_processed "$items"  # 무한 루프 방지
      RADAR_PROCESSED=$((RADAR_PROCESSED + count))
      continue
    fi

    # JSON 유효성 체크
    if ! echo "$analysis" | jq . >/dev/null 2>&1; then
      log_error "Radar 분석 결과가 유효한 JSON이 아니에요. 배치 건너뜀."
      mark_radar_processed "$items"
      RADAR_PROCESSED=$((RADAR_PROCESSED + count))
      continue
    fi

    # 결과 저장
    save_radar_results "$analysis" "$tenant_id"
    mark_radar_processed "$items"
    RADAR_PROCESSED=$((RADAR_PROCESSED + count))
    log "Radar 배치 완료: $count 건 처리, 누적 $RADAR_PROCESSED 건"

    # Rate limit 대기
    log "Rate limit 대기 ${RATE_LIMIT_WAIT}초..."
    sleep "$RATE_LIMIT_WAIT"
  done
}

###############################################################################
# Ontology 함수
###############################################################################

query_unprocessed_ontology() {
  local raw
  raw=$(d1_execute "SELECT e.id, e.content, e.discovery_id, d.tenant_id FROM evidence e JOIN discoveries d ON e.discovery_id = d.id WHERE e.ontology_extracted_at IS NULL OR e.ontology_extracted_at < e.created_at LIMIT $BATCH_SIZE;") || return 1
  d1_results "$raw"
}

analyze_ontology_item() {
  local content="$1"
  local prompt="다음 Evidence 텍스트에서 엔티티와 관계를 추출하세요.

Evidence:
$content

JSON 형식으로만 응답:
{\"entities\":[{\"label\":\"...\",\"type\":\"...\",\"confidence\":0.9}],\"relations\":[{\"from\":\"...\",\"to\":\"...\",\"type\":\"...\",\"strength\":0.8,\"confidence\":0.85}]}"

  local result
  result=$(claude -p "$prompt" \
    --output-format json \
    --allowedTools "Read,Glob,Grep" \
    --max-turns 3 \
    --append-system-prompt "JSON만 출력하세요. 추가 설명 없이 순수 JSON만 반환하세요." \
    2>/dev/null) || return 1

  echo "$result" | jq -r '.result'
}

save_ontology_results() {
  local analysis="$1"
  local evidence_id="$2"
  local discovery_id="$3"

  # 엔티티 저장 (confidence >= 0.5)
  local entities
  entities=$(echo "$analysis" | jq -c '[.entities[] | select(.confidence >= 0.5)]')
  local entity_count
  entity_count=$(echo "$entities" | jq 'length')

  # node id 매핑 (엣지 생성용)
  declare -A node_map  # label → node_id
  declare -A node_confidence  # label → confidence

  for i in $(seq 0 $((entity_count - 1))); do
    local label type_id confidence
    label=$(sql_escape "$(echo "$entities" | jq -r ".[$i].label")")
    type_id=$(echo "$entities" | jq -r ".[$i].type")
    confidence=$(echo "$entities" | jq -r ".[$i].confidence")

    local node_id="cn-$(gen_uuid)"
    local reviewed=0

    if ! d1_execute "INSERT INTO context_nodes (id, discovery_id, label, ontology_type_id, source_evidence_id, confidence, auto_generated, reviewed, created_at) VALUES ('$node_id', '$discovery_id', '$label', '$type_id', '$evidence_id', $confidence, 1, $reviewed, unixepoch());" >/dev/null; then
      log_error "노드 INSERT 실패: $label"
      continue
    fi
    NODES_CREATED=$((NODES_CREATED + 1))
    node_map["$label"]="$node_id"
    node_confidence["$label"]="$confidence"
  done

  # 관계 저장 (from/to 모두 confidence >= 0.8인 경우만)
  local relations
  relations=$(echo "$analysis" | jq -c '.relations // []')
  local rel_count
  rel_count=$(echo "$relations" | jq 'length')

  for i in $(seq 0 $((rel_count - 1))); do
    local from_label to_label rel_type strength confidence
    from_label=$(echo "$relations" | jq -r ".[$i].from")
    to_label=$(echo "$relations" | jq -r ".[$i].to")
    rel_type=$(sql_escape "$(echo "$relations" | jq -r ".[$i].type")")
    strength=$(echo "$relations" | jq -r ".[$i].strength")
    confidence=$(echo "$relations" | jq -r ".[$i].confidence")

    local from_id="${node_map[$from_label]:-}"
    local to_id="${node_map[$to_label]:-}"

    # from/to 노드가 모두 존재하고 confidence >= 0.8인지 확인
    if [[ -z "$from_id" || -z "$to_id" ]]; then
      continue
    fi
    local from_conf="${node_confidence[$from_label]:-0}"
    local to_conf="${node_confidence[$to_label]:-0}"
    if (( $(echo "$from_conf < 0.8" | bc -l) )) || (( $(echo "$to_conf < 0.8" | bc -l) )); then
      continue
    fi

    # strength를 0~100 정수로 변환
    local strength_int
    strength_int=$(echo "$strength * 100" | bc | cut -d. -f1)

    local edge_id="ce-$(gen_uuid)"
    if ! d1_execute "INSERT INTO context_edges (id, from_node_id, to_node_id, relation_type, strength, source_evidence_id, confidence, auto_generated, reviewed, created_at) VALUES ('$edge_id', '$from_id', '$to_id', '$rel_type', $strength_int, '$evidence_id', $confidence, 1, 0, unixepoch());" >/dev/null; then
      log_error "엣지 INSERT 실패: $from_label → $to_label"
      continue
    fi
    EDGES_CREATED=$((EDGES_CREATED + 1))
  done
}

mark_ontology_processed() {
  local evidence_id="$1"
  d1_execute "UPDATE evidence SET ontology_extracted_at = unixepoch() WHERE id = '$evidence_id';" >/dev/null || true
}

run_ontology_mode() {
  log "=== Ontology 모드 시작 ==="

  while true; do
    local items
    items=$(query_unprocessed_ontology) || { log_error "Evidence 조회 실패"; break; }

    local count
    count=$(echo "$items" | jq 'length')
    if [[ "$count" -eq 0 ]]; then
      log "Ontology 미처리 Evidence 모두 처리 완료."
      break
    fi
    log "Ontology 배치: $count 건 처리 중..."

    # 각 evidence를 개별 분석 (ontology는 아이템별로 독립적)
    for i in $(seq 0 $((count - 1))); do
      local eid content discovery_id
      eid=$(echo "$items" | jq -r ".[$i].id")
      content=$(echo "$items" | jq -r ".[$i].content")
      discovery_id=$(echo "$items" | jq -r ".[$i].discovery_id")

      log "Evidence 분석 중: $eid"

      local analysis
      if ! analysis=$(analyze_ontology_item "$content"); then
        log_error "Ontology 분석 실패: $eid (claude -p). 건너뜀."
        mark_ontology_processed "$eid"
        EVIDENCE_PROCESSED=$((EVIDENCE_PROCESSED + 1))
        sleep "$RATE_LIMIT_WAIT"
        continue
      fi

      # JSON 유효성 체크
      if ! echo "$analysis" | jq . >/dev/null 2>&1; then
        log_error "Ontology 분석 결과가 유효한 JSON이 아니에요: $eid. 건너뜀."
        mark_ontology_processed "$eid"
        EVIDENCE_PROCESSED=$((EVIDENCE_PROCESSED + 1))
        sleep "$RATE_LIMIT_WAIT"
        continue
      fi

      save_ontology_results "$analysis" "$eid" "$discovery_id"
      mark_ontology_processed "$eid"
      EVIDENCE_PROCESSED=$((EVIDENCE_PROCESSED + 1))
      log "Evidence 처리 완료: $eid"

      # Rate limit 대기 (마지막 아이템이 아닌 경우)
      if [[ $i -lt $((count - 1)) ]]; then
        log "Rate limit 대기 ${RATE_LIMIT_WAIT}초..."
        sleep "$RATE_LIMIT_WAIT"
      fi
    done

    # 배치 간 대기
    log "Rate limit 대기 ${RATE_LIMIT_WAIT}초..."
    sleep "$RATE_LIMIT_WAIT"
  done
}

###############################################################################
# 메인
###############################################################################

log "=== Batch Analysis Runner ==="
log "DB: $DB_NAME | Mode: $MODE | Batch: $BATCH_SIZE | Wait: ${RATE_LIMIT_WAIT}s"
echo ""

case "$MODE" in
  radar)
    run_radar_mode
    ;;
  ontology)
    run_ontology_mode
    ;;
  all)
    run_radar_mode
    echo ""
    run_ontology_mode
    ;;
  *)
    echo "사용법: $0 [radar|ontology|all]" >&2
    exit 1
    ;;
esac

echo ""
echo "=== Batch Analysis Results ==="
echo "Mode: $MODE"
echo "Radar processed: $RADAR_PROCESSED"
echo "Ideas generated: $IDEAS_GENERATED"
echo "Evidence processed: $EVIDENCE_PROCESSED"
echo "Nodes created: $NODES_CREATED"
echo "Edges created: $EDGES_CREATED"
echo "Errors: $ERROR_COUNT"
echo "API Credit: 0 (Claude Code subscription)"

if [[ $ERROR_COUNT -gt 0 ]]; then
  exit 1
fi
