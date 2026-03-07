---
code: DX-SPEC-003
title: Discovery-X PRD v3
version: 3.0
status: Active
category: SPEC
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=6.0"
---

# Discovery-X Architecture Upgrade PRD v3

**Graph-First · Topic-Scoped · Durable Agent 기반 설계**

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-02-16 |
| 버전 | v3.0 (Final) |
| 입력 | Claude 아키텍처 설계 + ChatGPT PRD v2 + 보완 보고서 + 다관점 리뷰 |
| 대상 | AX BD팀 개발자, PM |

---

# 1. 문서 목적

본 PRD v3는 Discovery-X를 **Graph 중심의 Agent 보조 지식 운영 플랫폼**으로
전환하기 위한 최종 아키텍처 설계를 정의한다.

이전 버전(v1~v2)과 3회에 걸친 교차 검토를 통합하여,
실제 구현에 착수할 수 있는 수준의 상세 사양을 포함한다.

---

# 2. 선결 과제: Discovery-X 포지셔닝

> **"Discovery-X는 Agent 플랫폼인가, Agent가 보조 수단인가?"**

## 확정: Agent는 Discovery-X를 보조하는 수단

Discovery-X의 본질은 **"신사업 기회 발굴 및 실험 시스템"**이며,
범용 Agent 플랫폼이 아니다.

```
[원칙 1] Discovery Pipeline이 시스템의 중심이다
[원칙 2] Graph Layer는 파이프라인 데이터의 정본(Source of Truth)이다
[원칙 3] Agent는 Graph를 읽고 사용자에게 맥락을 전달하는 접점이다
[원칙 4] Agent의 Graph 직접 수정은 제한적으로만 허용한다
[원칙 5] 협업(Topic)은 파이프라인 위의 조직화 수단이다
```

이 5가지 원칙이 이후 모든 설계 판단의 기준이 된다.

---

# 3. 아키텍처 개요

## 3.1 계층 구조

```
┌─────────────────────────────────────────────────┐
│ UI Layer  — Remix on Cloudflare Pages           │
│   (대화 UI, 프로파일, Topic, 브리핑, 대시보드)    │
├─────────────────────────────────────────────────┤
│ Service Layer  — app/lib/services/              │
│   (도메인 서비스: discovery, idea, radar, etc.)   │
├─────────────────────────────────────────────────┤
│ Graph Layer  — app/lib/graph/                   │
│   (JSON-LD 정본 + Query + Projection + 감사)     │
├──────────────┬──────────────────────────────────┤
│ ACL Layer    │ Integration Layer                │
│ app/lib/acl/ │ app/lib/integration/             │
│ (Scope       │ (Pipeline Bridge,               │
│  Resolution) │  Briefing Builder)              │
├──────────────┴──────────────────────────────────┤
│ Worker Layer                                     │
│   agent-worker (DO) │ collab-worker │ radar/venture│
├─────────────────────────────────────────────────┤
│ Storage Layer                                    │
│   D1 (SQLite) │ Vectorize │ R2 (파일)            │
└─────────────────────────────────────────────────┘
```

## 3.2 데이터 흐름 개요

```
사용자 입력
    ↓
Agent (DO) → Graph 조회 → 맥락 구성 → LLM 호출 → 응답
    ↓ (학습)
Memory flush → daily_log → long_term → Graph enrichment 제안
    ↓ (승인 시)
Graph 업데이트 → graph_events 기록 → Projection 재생성

파이프라인 ←→ Agent (양방향)
Radar 시그널 → Agent 브리핑 → 사용자 → 아이디어 제출 → Venture 평가
```

---

# 4. Graph Layer (정본 관리 구조)

## 4.1 JSON-LD @context 정의

```json
{
  "@context": {
    "dx": "https://discovery-x.app/ns/",
    "schema": "https://schema.org/",

    "dx:User": { "@id": "dx:User" },
    "dx:Topic": { "@id": "dx:Topic" },
    "dx:Decision": { "@id": "dx:Decision" },
    "dx:Signal": { "@id": "dx:Signal" },
    "dx:Glossary": { "@id": "dx:Glossary" },
    "dx:Expertise": { "@id": "dx:Expertise" },
    "dx:Preference": { "@id": "dx:Preference" },

    "dx:expertise": { "@type": "@id" },
    "dx:relatedTo": { "@type": "@id" },
    "dx:decidedBy": { "@type": "@id" },
    "dx:importance": { "@type": "schema:Float" },
    "dx:confidence": { "@type": "schema:Float" }
  }
}
```

**@id 네이밍 규칙:**
- User: `dx:user/{userId}`
- Topic: `dx:topic/{topicId}`
- Decision: `dx:topic/{topicId}/decision/{decisionId}`
- Signal: `dx:signal/{signalId}`

## 4.2 Graph 테이블

```sql
CREATE TABLE graphs (
  id           TEXT PRIMARY KEY,
  scope_type   TEXT NOT NULL CHECK (scope_type IN ('user', 'topic', 'org')),
  scope_id     TEXT NOT NULL,
  jsonld       TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),

  UNIQUE(scope_type, scope_id)
);
```

모든 Graph write는 반드시 `content_hash` 갱신 + `graph_events` 기록을 동반한다.

## 4.3 감사 로그

```sql
CREATE TABLE graph_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  graph_id     TEXT NOT NULL,
  actor_id     TEXT NOT NULL,
  actor_type   TEXT NOT NULL DEFAULT 'user'
               CHECK (actor_type IN ('user', 'agent', 'system')),
  action       TEXT NOT NULL
               CHECK (action IN ('create', 'update', 'delete', 'rollback')),
  diff_json    TEXT,
  reason       TEXT,
  prev_version INTEGER,
  new_version  INTEGER,
  created_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (graph_id) REFERENCES graphs(id)
);

CREATE INDEX idx_graph_events_graph ON graph_events(graph_id, created_at);
CREATE INDEX idx_graph_events_actor ON graph_events(actor_id);
```

## 4.4 Graph Query Engine

`app/lib/graph/query.ts` — JSON-LD를 "저장만" 하는 것이 아니라 조회·탐색하는 핵심 모듈.

```typescript
class GraphQueryEngine {
  constructor(private db: D1Database) {}

  // 1. ID로 단일 노드 조회
  async get(graphId: string, nodeId: string): Promise<JsonLdNode | null>

  // 2. @id URI 기반 관계 탐색 (그래프 간 링크 추적)
  async traverse(startId: string, relation: string, depth?: number): Promise<JsonLdNode[]>

  // 3. @type 기반 필터링
  async findByType(scopeType: ScopeType, scopeId: string, type: string): Promise<JsonLdNode[]>

  // 4. JSON path 추출 (D1 json_extract 활용)
  async extractPath(graphId: string, path: string): Promise<any>

  // 5. Vectorize 연동 시맨틱 검색
  async semanticSearch(query: string, scopeFilter?: ScopeFilter): Promise<SearchResult[]>
}
```

**Scope별 분리 원칙:**
```sql
-- User Graph: 개인 프로파일/선호도/전문성
SELECT jsonld FROM graphs WHERE scope_type = 'user' AND scope_id = ?

-- Topic Graph: 의사결정/용어/시그널 연결
SELECT jsonld FROM graphs WHERE scope_type = 'topic' AND scope_id = ?

-- Org Graph: 팀 공통 지식/규칙
SELECT jsonld FROM graphs WHERE scope_type = 'org' AND scope_id = ?
```

## 4.5 Projection 파이프라인

Graph(정본 JSON-LD) → **Projection Builder** → projections 테이블 → Agent bootstrap 시 주입

```sql
CREATE TABLE projections (
  id            TEXT PRIMARY KEY,
  scope_type    TEXT NOT NULL CHECK (scope_type IN ('user', 'topic', 'org')),
  scope_id      TEXT NOT NULL,
  proj_type     TEXT NOT NULL
                CHECK (proj_type IN ('USER.md', 'TOPIC.md', 'BRIEFING.md', 'SOUL.md')),
  content       TEXT NOT NULL,
  source_hash   TEXT NOT NULL,
  graph_version INTEGER NOT NULL,
  generated_at  TEXT DEFAULT (datetime('now')),

  UNIQUE(scope_type, scope_id, proj_type)
);
```

**핵심 결정: Projection은 템플릿 기반(LLM 미사용)**

```typescript
// app/lib/graph/projection.ts
class ProjectionBuilder {
  // Graph 변경 시 hash 비교 → 불일치 시만 재생성
  async syncProjection(scopeType: ScopeType, scopeId: string): Promise<boolean> {
    const graph = await this.graphStore.getByScopeId(scopeType, scopeId);
    const existing = await this.getProjection(scopeType, scopeId);

    if (existing?.source_hash === graph.content_hash) return false; // 변경 없음

    const content = this.buildFromTemplate(graph, scopeType);
    await this.upsertProjection({ scopeType, scopeId, content, sourceHash: graph.content_hash });
    return true;
  }

  // USER.md 템플릿 예시
  private buildUserProjection(graph: JsonLdGraph): string {
    return `## 역할\n${graph.role}\n\n## 전문 분야\n${formatList(graph.expertise)}\n...`;
  }
}
```

---

# 5. Topic 기반 협업 구조

## 5.1 구조: Team → Topic → Collab Sessions

```sql
CREATE TABLE topics (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT DEFAULT 'active'
              CHECK (status IN ('active', 'completed', 'archived')),
  created_by  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (created_by) REFERENCES user_profiles(id)
);

CREATE TABLE topic_members (
  topic_id    TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  role        TEXT DEFAULT 'editor'
              CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (topic_id, user_id),
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (user_id) REFERENCES user_profiles(id)
);
```

**설계 근거:** BD팀 5명이 모든 주제에 관여하는 게 아님.
"AI 반도체" 토픽에는 A, B만, "헬스케어" 토픽에는 B, C, D만 참여하는 식이 현실적.
Topic 단위로 시그널을 라우팅하고 의사결정을 추적.

## 5.2 공유 시그널 (Topic 연결)

```sql
CREATE TABLE shared_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_user_id  TEXT NOT NULL,
  team_id         TEXT NOT NULL,
  topic_id        TEXT,
  content_summary TEXT NOT NULL,
  score           REAL NOT NULL,
  opportunity_id  TEXT,
  routed_to       TEXT,
  status          TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (source_user_id) REFERENCES user_profiles(id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE INDEX idx_signals_team_score ON shared_signals(team_id, score);
CREATE INDEX idx_signals_topic ON shared_signals(topic_id) WHERE topic_id IS NOT NULL;
```

---

# 6. Scope Resolution Engine

## 6.1 흐름

```
Request
  ↓
┌─────────────────────┐
│ 1. Scope 판정        │  URL 패턴으로 scope_type + scope_id 추출
│    /user/* → user    │  /topic/:id → topic
│    /team/* → org     │
├─────────────────────┤
│ 2. Role 확인         │  user scope → 본인이면 owner
│                      │  topic scope → topic_members.role 조회
│                      │  org scope → teams 소속 여부
├─────────────────────┤
│ 3. Permission 매핑    │  Role × Action → Allow / Deny
├─────────────────────┤
│ 4. 결과 반환 + 로깅   │  거부 시 403 + 감사 로그 기록
└─────────────────────┘
```

## 6.2 Permission Matrix

| Role | read | write | delete | admin |
|------|------|-------|--------|-------|
| owner | ✅ | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ❌ | ❌ |
| viewer | ✅ | ❌ | ❌ | ❌ |
| none | ❌ | ❌ | ❌ | ❌ |

## 6.3 구현 위치

```typescript
// app/lib/acl/resolver.ts
class ScopeResolver {
  async resolve(request: AccessRequest): Promise<AccessResult> {
    const scope = this.extractScope(request);
    const role = await this.getRole(request.userId, scope);
    const allowed = this.checkPermission(role, request.action);

    if (!allowed) {
      await this.auditLog.record({ userId: request.userId, scope, action: request.action, result: 'denied' });
    }

    return { allowed, role, scope };
  }
}

// app/lib/acl/middleware.ts — Remix loader/action에서 사용
export function requireAccess(scopeType: ScopeType, action: Action) {
  return async (args: LoaderFunctionArgs) => {
    const result = await resolver.resolve({
      userId: args.context.userId,
      scopeType,
      scopeId: args.params.id,
      action
    });
    if (!result.allowed) throw new Response('Forbidden', { status: 403 });
    return result;
  };
}
```

## 6.4 Agent의 Graph 수정 제한

| Agent 행위 | 허용 여부 | 비고 |
|------------|----------|------|
| Graph 읽기 | ✅ 항상 | 맥락 구성용 |
| 메모리 저장 (agent_memory) | ✅ 항상 | 자체 테이블 |
| Graph enrichment 제안 | ✅ | graph_events에 'suggest'로 기록 |
| Graph 직접 수정 | ⚠️ 제한적 | learned_pref만 허용, 사용자 확인 후 |
| Graph 삭제 | ❌ 불가 | 사용자 전용 |

---

# 7. Durable Agent Runtime

## 7.1 AgentSession Durable Object

기존 stateless Worker를 사용자별 싱글톤 Durable Object로 전환.

```
사용자 요청 → Worker (라우터) → DO(userId) 조회/생성
                                    ↓
                              AgentSession DO
                              ├── isProcessing (동시성 lock)
                              ├── context cache
                              ├── token budget tracker
                              └── flush scheduler (alarm)
```

### 핵심 동작

```typescript
// agent-worker/src/agent-session.ts
export class AgentSession implements DurableObject {
  private isProcessing = false;
  private tokenCount = 0;
  private lastActivityAt = Date.now();

  async fetch(request: Request): Promise<Response> {
    if (this.isProcessing) {
      return new Response('Agent is busy', { status: 429 });
    }

    this.isProcessing = true;
    this.lastActivityAt = Date.now();

    try {
      const response = await this.handleChat(request);
      return response;
    } finally {
      this.isProcessing = false;
      // 비활성 30분 후 자동 flush
      await this.state.storage.setAlarm(Date.now() + 30 * 60 * 1000);
    }
  }

  async alarm(): Promise<void> {
    if (Date.now() - this.lastActivityAt > 30 * 60 * 1000) {
      await this.flushMemory();
      await this.state.storage.deleteAll(); // 세션 정리
    }
  }

  private async handleChat(request: Request): Promise<Response> {
    // 1. 프로파일 로드 (Projection 캐시 → Graph fallback)
    // 2. SOUL 프롬프트 조립
    // 3. LLM 스트리밍 호출
    // 4. SSE로 응답 전송
    // 5. 토큰 카운트 갱신
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }
}
```

### 동시성 시나리오

| 상황 | 동작 | 사용자 경험 |
|------|------|------------|
| 탭 A에서 질문 중 + 탭 B에서 질문 | 탭 B → 429 | "다른 대화가 진행 중입니다" 안내 |
| 30분 비활성 후 재접속 | alarm → flush → 새 세션 | 이전 맥락 요약으로 자연스러운 연결 |
| 세션 중 네트워크 끊김 | SSE 재연결 시 DO에서 상태 복원 | 자동 재연결 |

### Worker 라우팅

```typescript
// agent-worker/src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const userId = await authenticate(request);
    const doId = env.AGENT_SESSION.idFromName(userId);
    const stub = env.AGENT_SESSION.get(doId);
    return stub.fetch(request);
  }
};

export { AgentSession } from './agent-session';
```

---

# 8. Agent Memory Lifecycle

## 8.1 메모리 테이블 (확장)

```sql
CREATE TABLE agent_memory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  memory_type TEXT NOT NULL
              CHECK (memory_type IN ('daily_log', 'long_term', 'learned_pref')),
  category    TEXT,
  content     TEXT NOT NULL,
  metadata    TEXT,
  log_date    TEXT,
  importance  REAL DEFAULT 0.5,
  token_count INTEGER DEFAULT 0,
  archived_at TEXT,
  expires_at  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user_profiles(id)
);

CREATE INDEX idx_memory_user_type ON agent_memory(user_id, memory_type);
CREATE INDEX idx_memory_user_date ON agent_memory(user_id, log_date);
CREATE INDEX idx_memory_expires ON agent_memory(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_memory_archived ON agent_memory(archived_at) WHERE archived_at IS NULL;
```

## 8.2 3단계 수명 모델

| 단계 | 유지 기간 | 정리 조건 | 정리 방법 |
|------|----------|----------|----------|
| daily_log | 30일 | 30일 초과 | archived_at 설정 |
| daily_log (archived) | 90일 | importance < 0.3 | 삭제 |
| long_term | 계속 유지 | 90일 초과 + 유사도 높은 항목 | LLM 요약 병합 |
| learned_pref | 영구 | — | 사용자 수동 삭제만 |

## 8.3 토큰 예산 관리

```typescript
// app/lib/cost/token-budget.ts
class TokenBudgetManager {
  private readonly USER_MEMORY_BUDGET = 100_000; // 사용자당 메모리 토큰
  private readonly MONTHLY_LLM_BUDGET = 2_000_000; // 월간 LLM 토큰

  async checkBudget(userId: string): Promise<BudgetStatus> {
    const memoryTokens = await this.getMemoryTokenCount(userId);
    const monthlyUsage = await this.getMonthlyLLMUsage(userId);

    return {
      memoryUsed: memoryTokens,
      memoryLimit: this.USER_MEMORY_BUDGET,
      memoryOk: memoryTokens < this.USER_MEMORY_BUDGET,
      monthlyUsed: monthlyUsage,
      monthlyLimit: this.MONTHLY_LLM_BUDGET,
      monthlyOk: monthlyUsage < this.MONTHLY_LLM_BUDGET,
    };
  }
}
```

```sql
-- 토큰 사용량 추적
CREATE TABLE token_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL NOT NULL DEFAULT 0.0,
  purpose       TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES user_profiles(id)
);

CREATE INDEX idx_usage_user_month ON token_usage(user_id, created_at);
```

## 8.4 Memory Lifecycle 엔진

```typescript
// app/lib/agent/memory-lifecycle.ts
class MemoryLifecycle {
  // 주간 Cron에서 호출
  async compact(userId: string): Promise<CompactionResult> {
    // 1. 30일 초과 daily_log → archived_at 설정
    // 2. 90일 초과 + importance < 0.3 → 삭제
    // 3. long_term 유사 항목 → LLM 요약 병합
    // 4. 토큰 예산 초과 시 강제 정리
  }

  async enforceTokenBudget(userId: string): Promise<void> {
    const budget = await this.budgetManager.checkBudget(userId);
    if (!budget.memoryOk) {
      // importance 낮은 순으로 삭제
      await this.pruneByImportance(userId, budget.memoryLimit);
    }
  }
}
```

---

# 9. Discovery 파이프라인 통합

## 9.1 양방향 인터페이스 계약

```typescript
// app/lib/integration/pipeline-bridge.ts

// 파이프라인 → Agent (읽기 전용)
interface PipelineToAgent {
  getRelevantSignals(userId: string, limit?: number): Promise<Signal[]>;
  getOpportunityStatus(opportunityId: string): Promise<OpportunityStatus>;
  getBriefingMaterial(userId: string): Promise<BriefingData>;
  getEntitySuggestions(userId: string): Promise<EntitySuggestion[]>;
}

// Agent → 파이프라인 (제한적 쓰기)
interface AgentToPipeline {
  submitIdea(userId: string, idea: IdeaInput): Promise<IdeaResult>;
  annotateSignal(signalId: string, annotation: string): Promise<void>;
  getExpertiseScore(userId: string, domain: string): Promise<number>;
}
```

## 9.2 연동 흐름

```
[Radar Worker]
  score ≥ 7 시그널 → Topic 매칭 → 사용자 브리핑 반영
                                     ↓
[Agent Session]
  일간 브리핑 = Radar 시그널 + 파이프라인 변경 + Lab 엔티티 제안
                                     ↓
[사용자 아이디어 제출]
  Agent 대화 중 → submitIdea() → Venture Worker 자동 평가

[Lab Worker]
  엔티티 추출 → User Graph enrichment 제안 (사용자 승인 필요)
```

## 9.3 Cron Trigger

```
매일 07:00 KST  — 일간 브리핑 생성 (BriefingBuilder)
매주 일 03:00   — Memory compaction (MemoryLifecycle)
매주 일 04:00   — Projection 일괄 동기화
```

---

# 10. Vectorize 활용 전략

## 10.1 임베딩 대상

| 데이터 소스 | 임베딩 내용 | namespace | 업데이트 주기 |
|------------|-----------|-----------|-------------|
| graphs (user) | 전문성, 관심사, 선호도 | `user-profiles` | Graph 변경 시 |
| graphs (topic) | 의사결정, 용어, 맥락 | `topic-knowledge` | Graph 변경 시 |
| agent_memory | long_term 메모리 | `agent-memory` | Cron 일간 |
| shared_signals | 시그널 요약 | `signals` | 시그널 생성 시 |

## 10.2 활용 시나리오

- **Agent 대화:** 관련 메모리/시그널 검색으로 맥락 보강
- **시그널 라우팅:** 시그널과 사용자 전문성 유사도 매칭
- **프로파일 추천:** 유사 전문성 사용자 탐색 (팀 내)

## 10.3 점진 도입

Phase 4에서 도입. 초기에는 Vectorize 없이 keyword 기반으로 동작하도록 설계하고,
`semanticSearch()` 메서드가 Vectorize 사용 여부를 Feature Flag로 분기.

---

# 11. UI 화면 정의

## 11.1 화면 목록

| Phase | 화면 | 경로 | 핵심 기능 |
|-------|------|------|----------|
| P1 | 에이전트 대화 | `/agent` | SSE 스트리밍 채팅, 세션 히스토리 |
| P1 | 프로파일 편집 | `/profile` | Graph 기반 프로파일 뷰/편집 |
| P2 | Topic 목록 | `/topics` | 생성, 검색, 상태 필터 |
| P2 | Topic 상세 | `/topics/:id` | 멤버 관리, 시그널 연결, 의사결정 기록 |
| P2 | 브리핑 뷰 | `/briefing` | 일간/주간 자동 브리핑 |
| P3 | 시그널 현황 | `/signals` | 라우팅 현황, Topic별 필터 |
| P4 | Graph 롤백 | `/profile/history` | 버전 비교 + 원클릭 롤백 |
| P4 | 비용 대시보드 | `/admin/costs` | 토큰 사용량 차트 |

## 11.2 에러/엣지케이스 UX

| 상황 | 사용자 경험 |
|------|------------|
| DO 동시 접속 (429) | Toast: "다른 탭에서 대화가 진행 중입니다. 잠시 후 다시 시도하세요." |
| 토큰 예산 초과 | 대화 입력 비활성화 + "이번 달 사용량을 초과했습니다" 안내 |
| Memory flush 실패 | 재시도 3회 → 실패 시 "대화 내용 저장에 실패했습니다" 경고 |
| Projection 재생성 중 | 기존 Projection 캐시 사용 + 백그라운드 갱신 (사용자 무감지) |
| Graph 롤백 | 변경 전/후 diff 표시 → 사용자 확인 → 원클릭 롤백 |
| ACL 거부 (403) | "이 Topic에 대한 접근 권한이 없습니다" + Topic owner 연락 안내 |

---

# 12. 기반 테이블

```sql
CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  profile_ld  TEXT NOT NULL,
  rules_md    TEXT DEFAULT '',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE user_profiles (
  id           TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email        TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

CREATE TABLE agent_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  started_at  TEXT DEFAULT (datetime('now')),
  ended_at    TEXT,
  token_count INTEGER DEFAULT 0,
  token_cost  REAL DEFAULT 0.0,
  summary     TEXT,
  FOREIGN KEY (user_id) REFERENCES user_profiles(id)
);
```

---

# 13. 디렉터리 구조

```
Discovery-X/
├── app/
│   ├── routes/                    # Thin controller (Phase 0 리팩터링)
│   │   ├── (기존 라우트 유지)
│   │   ├── agent/                 # [NEW] 에이전트 UI
│   │   ├── profile/               # [NEW] 프로파일 관리
│   │   └── topic/                 # [NEW] Topic 협업
│   │
│   ├── lib/
│   │   ├── services/              # [NEW] 도메인 서비스 (P0)
│   │   │   ├── discovery.service.ts
│   │   │   ├── idea.service.ts
│   │   │   ├── proposal.service.ts
│   │   │   ├── radar.service.ts
│   │   │   └── venture.service.ts
│   │   │
│   │   ├── graph/                 # [NEW] Graph Layer
│   │   │   ├── store.ts           #   CRUD + 버전 관리
│   │   │   ├── query.ts           #   Graph Query Engine
│   │   │   ├── context.ts         #   @context 관리
│   │   │   ├── projection.ts      #   Graph → Markdown
│   │   │   ├── validator.ts       #   스키마 검증
│   │   │   └── types.ts
│   │   │
│   │   ├── acl/                   # [NEW] Scope Resolution
│   │   │   ├── resolver.ts
│   │   │   ├── policies.ts
│   │   │   ├── middleware.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── agent/                 # [NEW] Agent 코어
│   │   │   ├── bootstrap.ts
│   │   │   ├── memory.ts
│   │   │   ├── memory-lifecycle.ts
│   │   │   └── soul-engine.ts
│   │   │
│   │   ├── integration/           # [NEW] 파이프라인 통합
│   │   │   ├── pipeline-bridge.ts
│   │   │   └── briefing-builder.ts
│   │   │
│   │   ├── cost/                  # [NEW] 비용 관리
│   │   │   └── token-budget.ts
│   │   │
│   │   ├── types/                 # [NEW] 공유 타입
│   │   │   └── enums.ts
│   │   │
│   │   └── db/
│   │       ├── schema.ts
│   │       └── schema-v2.ts       # 새 테이블 스키마
│   │
│   └── components/
│
├── agent-worker/                  # [NEW] Durable Object 기반
│   ├── src/
│   │   ├── index.ts               #   Worker 엔트리 (DO 라우팅)
│   │   ├── agent-session.ts       #   AgentSession DO
│   │   ├── llm-client.ts
│   │   └── tool-registry.ts
│   └── wrangler.toml
│
├── collab-worker/                 # [NEW] 협업 + Cron
│   ├── src/
│   │   ├── index.ts
│   │   ├── signal-router.ts
│   │   ├── cron-handler.ts
│   │   └── notification.ts
│   └── wrangler.toml
│
├── radar-worker/                  # 기존 유지
├── venture-worker/                # 기존 유지
│
├── schemas/
│   ├── contexts/
│   │   └── discovery-x.jsonld     # @context 정의
│   ├── templates/
│   │   ├── SOUL.md
│   │   ├── SOUL-analyst.md
│   │   └── SOUL-manager.md
│   └── validation/
│       ├── user.schema.json
│       ├── topic.schema.json
│       └── graph.schema.json
│
├── drizzle/                       # 마이그레이션
├── docs/
├── tests/
└── (기존 설정 파일 유지)
```

---

# 14. Phase 로드맵

## Phase 0 (1주) — 구조 정비

- routes → services 로직 이동 (도메인 서비스 분리)
- JSON-LD @context + @id 전략 확정 (discovery-x.jsonld)
- D1 마이그레이션 (전체 스키마 일괄 적용)
- `app/lib/types/enums.ts` (CHECK 제약 + TypeScript 타입 가드)
- `app/lib/acl/` 기본 구조 (ScopeResolver stub)
- Feature Flag 설정 (wrangler.toml vars)

**산출물:** 서비스 분리된 코드베이스, 전체 DB 스키마, Feature Flag 체계

## Phase 1 (2~3주) — Graph Layer + Agent Runtime

- `app/lib/graph/` 전체 구현 (store, query, projection, validator)
- `agent-worker/` + AgentSession Durable Object
- SSE 스트리밍 + 동시성 제어 (429)
- SOUL 엔진 + LLM 클라이언트 (Anthropic API)
- Projection 파이프라인 (JSON-LD → USER.md, 템플릿 기반)
- 기본 대화 UI (`/agent`)
- 프로파일 편집 UI (`/profile`)

**산출물:** 동작하는 Agent 대화, 프로파일 Graph 편집

## Phase 2 (2주) — ACL + Topic + Memory

- ScopeResolver 완성 + Remix 미들웨어 적용
- Topics + topic_members 테이블 + UI
- Topic Graph (Decision/Glossary 모델)
- Memory flush + daily_log + long_term
- Memory Lifecycle (TTL, importance, archive)
- graph_events 감사 로그 전체 적용
- 브리핑 뷰 (`/briefing`)

**산출물:** Topic 기반 협업, 메모리 자동 관리, ACL 적용

## Phase 3 (2~3주) — 협업 + 파이프라인 통합

- `collab-worker/` (시그널 라우팅, 전문가 매칭)
- `pipeline-bridge.ts` (양방향 통합 계약)
- Cron Trigger (일간 브리핑, 주간 memory compaction)
- `token_usage` 추적 + TokenBudgetManager
- Projection 동기화 (hash 기반 자동 갱신)
- Feature Flag 기반 점진적 활성화

**산출물:** 파이프라인 연동, 자동 브리핑, 비용 추적

## Phase 4 (2주) — 고도화 + 안정화

- ProfileLearner (주간 자동 학습)
- Graph 버전 롤백 UI
- Vectorize 연동 (시맨틱 검색)
- 팀 지식 베이스 UI
- 비용 대시보드
- E2E 테스트 + 부하 테스트

**산출물:** 전체 기능 완성, 프로덕션 준비

**총 예상 기간: 9~11주 (2인 기준)**

---

# 15. 성공 지표

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| Graph write 감사 기록 | 100% | `graph_events.count` / Graph 변경 횟수 |
| Projection 재생성 지연 | < 3초 | Graph 업데이트 → Projection updated_at 차이 |
| Agent bootstrap 시간 | < 500ms | DO fetch 시작 → 첫 SSE 이벤트까지 |
| Memory flush 실패율 | < 1% | flush 실패 건수 / 총 flush 시도 |
| Signal 라우팅 정확도 | > 80% | 라우팅된 시그널 중 사용자가 "관련 있음" 평가 비율 |
| 월간 토큰 초과 사용자 | < 5% | budget 초과 사용자 / 전체 활성 사용자 |
| 서비스 분리율 | > 90% | services/에 위치한 비즈니스 로직 라인 수 비율 |

---

# 16. 리스크 평가

| 리스크 | 확률 | 영향 | 완화 전략 |
|--------|------|------|----------|
| D1 동시 쓰기 충돌 | 중 | 중 | Graph version 기반 낙관적 잠금 |
| DO 콜드 스타트 지연 | 중 | 낮 | state.storage 기반 세션 복원 |
| LLM 비용 폭증 | 중 | 높 | TokenBudgetManager + 월간 상한 |
| JSON-LD 스키마 변경 | 낮 | 높 | @context 버전 관리 + 마이그레이션 스크립트 |
| Vectorize 검색 품질 | 중 | 중 | Phase 4 점진 도입 + 수동 검증 기간 |
| 2인 팀 병목 | 높 | 중 | Phase별 독립 배포 + Feature Flag |
| Memory compaction 중 데이터 손실 | 낮 | 높 | compaction 전 스냅샷 + 롤백 경로 |

---

# 17. 비용 추정 (월간, 사용자 5명 기준)

| 항목 | 추정 | 비고 |
|------|------|------|
| LLM (대화) | ~$50 | 사용자당 일 3~5회 대화, Claude Sonnet 기준 |
| LLM (브리핑/compaction) | ~$10 | Cron 작업 |
| Cloudflare Workers | Free tier | 10만 요청/일 이내 |
| D1 | Free tier | 5GB 이내 |
| Vectorize | ~$5 | 10만 벡터 이내 |
| **총 월간** | **~$65** | 5명 팀 기준 |

---

# 18. 결론

본 PRD v3는 Discovery-X를 단순 기능 확장이 아닌
**Graph 중심의 Agent 보조 지식 운영 플랫폼**으로 전환하기 위한 최종 설계다.

핵심 설계 축:
1. **Graph(정본)** — JSON-LD 기반 지식 구조, 버전 관리, 감사 로그
2. **Projection(캐시)** — 템플릿 기반 Markdown 생성, hash 동기화
3. **Durable Agent** — 사용자별 싱글톤 DO, 동시성 제어, 메모리 관리
4. **Topic 협업** — Team → Topic 세분화, Scope-based ACL
5. **파이프라인 통합** — Radar/Venture/Lab 양방향 연동

이 5가지 축이 확장성과 안정성을 동시에 확보하며,
9~11주의 점진적 배포로 프로덕션 전환을 완료한다.

---

**부록: 전체 DB 스키마 요약**

| 테이블 | 용도 | Phase |
|--------|------|-------|
| teams | 팀 | 기존 |
| user_profiles | 사용자 | 기존 |
| graphs | JSON-LD 정본 | P0 |
| graph_events | 감사 로그 | P0 |
| projections | Projection 캐시 | P1 |
| agent_memory | 에이전트 메모리 | P1 |
| agent_sessions | 세션 추적 | P1 |
| topics | Topic | P2 |
| topic_members | Topic 멤버/권한 | P2 |
| shared_signals | 시그널 라우팅 | P3 |
| token_usage | 토큰 비용 추적 | P3 |
