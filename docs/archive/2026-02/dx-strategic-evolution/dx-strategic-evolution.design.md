# Discovery-X 전략적 진화 설계서

> Plan 문서: `docs/01-plan/features/dx-strategic-evolution.plan.md` 기반 상세 설계

## 1. 설계 개요

### 1.1 범위

Plan 문서의 6개 기능 중 **Phase 1 (L2 기반 강화)** 3개 기능의 상세 설계:
- F3. AI 운영 로그 자산화 (P0)
- F1. Industry Adapter 프레임워크 (P1)
- F5. 규제·감사 대응 Agent 고도화 (P2)

Phase 2, 3은 별도 PDCA 사이클에서 진행 (현재 범위 외).

### 1.2 설계 원칙

1. **기존 구조 호환**: 현재 30개 테이블 + 45개 Agent 도구와 충돌 없이 확장
2. **점진적 마이그레이션**: 기존 데이터 무손실, 단계적 활성화
3. **모듈화**: 각 기능은 독립적으로 활성화/비활성화 가능

---

## 2. F3. AI 운영 로그 자산화 상세 설계

### 2.1 목표

- Agent 대화, 판단 로그를 **장기 자산**으로 축적
- 축적된 로그에서 **패턴 추출** 및 **재사용 가능 규칙** 자동 생성
- **지식 그래프(Ontology)** 연결로 맥락 보존

### 2.2 데이터 모델

#### 2.2.1 신규 테이블: `decision_logs`

```sql
CREATE TABLE decision_logs (
  id TEXT PRIMARY KEY,
  discovery_id TEXT NOT NULL REFERENCES discoveries(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id),

  -- 판단 내용
  decision_type TEXT NOT NULL,  -- 'stage_transition' | 'evidence_evaluation' | 'method_selection' | 'gate_decision'
  input_context TEXT,           -- 판단 시점 컨텍스트 (JSON, 압축)
  decision_result TEXT NOT NULL, -- 판단 결과 요약
  confidence_score INTEGER,      -- 0~100 (AI 자신감)
  rationale TEXT,                -- 판단 근거

  -- 메타
  actor_type TEXT NOT NULL DEFAULT 'agent',  -- 'agent' | 'user' | 'system'
  actor_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  -- 아카이브
  archived_at INTEGER,
  archive_batch_id TEXT
);

CREATE INDEX idx_decision_logs_discovery ON decision_logs(discovery_id);
CREATE INDEX idx_decision_logs_type ON decision_logs(decision_type);
CREATE INDEX idx_decision_logs_created ON decision_logs(created_at);
```

#### 2.2.2 신규 테이블: `extracted_patterns`

```sql
CREATE TABLE extracted_patterns (
  id TEXT PRIMARY KEY,

  -- 패턴 정의
  pattern_type TEXT NOT NULL,  -- 'success' | 'failure' | 'decision' | 'workflow'
  name TEXT NOT NULL,
  description TEXT,
  conditions TEXT,             -- JSON: 패턴 발동 조건
  frequency INTEGER DEFAULT 1, -- 발생 빈도

  -- 연결
  source_log_ids TEXT,         -- JSON: 원본 로그 ID 목록
  industry_adapter_id TEXT REFERENCES industry_adapters(id),

  -- 품질
  confidence_score INTEGER,    -- 0~100
  validated_at INTEGER,
  validated_by TEXT REFERENCES users(id),

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_extracted_patterns_type ON extracted_patterns(pattern_type);
```

#### 2.2.3 신규 테이블: `reusable_rules`

```sql
CREATE TABLE reusable_rules (
  id TEXT PRIMARY KEY,

  -- 규칙 정의
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL,       -- 'validation' | 'recommendation' | 'alert' | 'automation'
  condition_expression TEXT NOT NULL,  -- JSON Logic 표현식
  action_template TEXT,          -- 실행할 액션 템플릿

  -- 적용 범위
  applicable_stages TEXT,        -- JSON: 적용 가능 단계
  industry_adapter_id TEXT REFERENCES industry_adapters(id),

  -- 출처
  source_pattern_id TEXT REFERENCES extracted_patterns(id),
  source_evidence_ids TEXT,      -- JSON

  -- 상태
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_reusable_rules_type ON reusable_rules(rule_type);
CREATE INDEX idx_reusable_rules_enabled ON reusable_rules(enabled);
```

### 2.3 Cron 작업 설계

#### 2.3.1 로그 아카이브 Cron

**파일**: `app/routes/api.cron.log-archive.ts`

```typescript
// 매주 일요일 03:00 실행
// 30일 이상 된 decision_logs를 압축 아카이브
export async function archiveDecisionLogs(db: D1Database) {
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
  const batchId = `archive-${new Date().toISOString().slice(0, 10)}`;

  // 1. 아카이브 대상 선별
  // 2. input_context JSON 압축 (gzip)
  // 3. archived_at, archive_batch_id 업데이트
  // 4. 통계 기록
}
```

#### 2.3.2 패턴 추출 Cron

**파일**: `app/routes/api.cron.pattern-extract.ts`

```typescript
// 매일 04:00 실행
// 최근 7일 로그에서 반복 패턴 추출
export async function extractPatterns(db: D1Database) {
  // 1. 최근 로그 조회
  // 2. decision_type별 클러스터링
  // 3. 유사 패턴 병합 (similarity > 0.8)
  // 4. extracted_patterns 저장
  // 5. 빈도 3회 이상 패턴 → reusable_rules 자동 생성 제안
}
```

### 2.4 Agent 도구 추가

#### 2.4.1 `extract_decision_pattern`

```typescript
{
  name: "extract_decision_pattern",
  description: "특정 Discovery의 의사결정 패턴을 분석하고 재사용 가능한 규칙으로 추출합니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId"],
    properties: {
      discoveryId: { type: "string" },
      patternType: {
        type: "string",
        enum: ["success", "failure", "decision", "workflow"]
      },
      minConfidence: { type: "integer", minimum: 0, maximum: 100, default: 70 }
    }
  }
}
```

#### 2.4.2 `apply_reusable_rule`

```typescript
{
  name: "apply_reusable_rule",
  description: "재사용 가능한 규칙을 현재 Discovery에 적용합니다.",
  input_schema: {
    type: "object",
    required: ["ruleId", "discoveryId"],
    properties: {
      ruleId: { type: "string" },
      discoveryId: { type: "string" },
      dryRun: { type: "boolean", default: true }
    }
  }
}
```

### 2.5 UI 확장

- `/discoveries/:id/patterns` 라우트 추가
  - 해당 Discovery에서 추출된 패턴 목록
  - 적용 가능한 규칙 추천
- Dashboard에 "Knowledge Assets" 탭 추가
  - 전체 패턴/규칙 통계
  - 자산 증가 추이 차트

---

## 3. F1. Industry Adapter 프레임워크 상세 설계

### 3.1 목표

- Discovery에 **산업 컨텍스트** 부여
- 산업별 **규제 조건**, **판단 규칙**, **성공 패턴** 축적
- Method Pack과 연계하여 산업별 워크플로우 지원

### 3.2 데이터 모델

#### 3.2.1 신규 테이블: `industry_adapters`

```sql
CREATE TABLE industry_adapters (
  id TEXT PRIMARY KEY,

  -- 기본 정보
  code TEXT NOT NULL UNIQUE,     -- 'manufacturing', 'finance', 'healthcare', etc.
  name_ko TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT NOT NULL DEFAULT '#6B7280',

  -- 규제 환경
  regulatory_framework TEXT,     -- JSON: 주요 규제 목록
  compliance_requirements TEXT,  -- JSON: 필수 준수 사항

  -- 산업별 설정
  default_timebox_days INTEGER DEFAULT 28,
  evidence_weight_modifiers TEXT, -- JSON: {A: 1.0, B: 0.9, ...}

  -- 연결
  parent_adapter_id TEXT REFERENCES industry_adapters(id),  -- 계층 구조

  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_industry_adapters_code ON industry_adapters(code);
CREATE INDEX idx_industry_adapters_enabled ON industry_adapters(enabled);
```

#### 3.2.2 신규 테이블: `industry_rules`

```sql
CREATE TABLE industry_rules (
  id TEXT PRIMARY KEY,
  industry_adapter_id TEXT NOT NULL REFERENCES industry_adapters(id) ON DELETE CASCADE,

  -- 규칙 정의
  rule_type TEXT NOT NULL,        -- 'validation' | 'scoring' | 'gate_criteria' | 'method_recommendation'
  name_ko TEXT NOT NULL,
  condition TEXT NOT NULL,        -- JSON Logic 표현식
  action TEXT NOT NULL,           -- JSON: 조건 충족 시 행동

  -- 우선순위
  priority INTEGER DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_industry_rules_adapter ON industry_rules(industry_adapter_id);
CREATE INDEX idx_industry_rules_type ON industry_rules(rule_type);
```

#### 3.2.3 discoveries 테이블 확장

```sql
ALTER TABLE discoveries ADD COLUMN industry_adapter_id TEXT REFERENCES industry_adapters(id);
CREATE INDEX idx_discoveries_industry ON discoveries(industry_adapter_id);
```

### 3.3 시드 데이터

```typescript
// app/db/seed.ts 확장
export const industryAdaptersSeed = [
  {
    id: "ind_manufacturing",
    code: "manufacturing",
    name_ko: "제조업",
    regulatory_framework: JSON.stringify(["산업안전보건법", "품질경영시스템(ISO 9001)"]),
    default_timebox_days: 28,
  },
  {
    id: "ind_finance",
    code: "finance",
    name_ko: "금융/보험",
    regulatory_framework: JSON.stringify(["금융소비자보호법", "개인정보보호법", "전자금융거래법"]),
    compliance_requirements: JSON.stringify(["KYC", "AML", "정보보호관리체계(ISMS)"]),
    default_timebox_days: 21,
  },
  {
    id: "ind_healthcare",
    code: "healthcare",
    name_ko: "헬스케어/의료",
    regulatory_framework: JSON.stringify(["의료법", "약사법", "의료기기법"]),
    compliance_requirements: JSON.stringify(["GMP", "HIPAA 준용"]),
    default_timebox_days: 35,
  },
  {
    id: "ind_public",
    code: "public",
    name_ko: "공공/정부",
    regulatory_framework: JSON.stringify(["국가계약법", "정보공개법", "공공기관운영법"]),
    compliance_requirements: JSON.stringify(["국정감사 대응", "보안성 검토"]),
    default_timebox_days: 42,
  },
  {
    id: "ind_energy",
    code: "energy",
    name_ko: "에너지/환경",
    regulatory_framework: JSON.stringify(["전기사업법", "환경영향평가법", "RE100"]),
    default_timebox_days: 28,
  },
];
```

### 3.4 Agent 도구 수정

#### 3.4.1 `create_discovery` 확장

```typescript
// input_schema.properties 추가
industryCode: {
  type: "string",
  enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
  description: "산업 분류 코드 (선택)"
}
```

#### 3.4.2 신규 도구: `get_industry_context`

```typescript
{
  name: "get_industry_context",
  description: "특정 산업의 규제 환경, 준수 사항, 적용 가능한 규칙을 조회합니다.",
  input_schema: {
    type: "object",
    required: ["industryCode"],
    properties: {
      industryCode: { type: "string" },
      includeRules: { type: "boolean", default: true }
    }
  }
}
```

### 3.5 UI 확장

- Discovery 생성/편집 폼에 "산업 분류" 드롭다운 추가
- Discovery 상세에 "산업 컨텍스트" 섹션 표시
  - 적용 규제 목록
  - 준수 사항 체크리스트
- Dashboard 필터에 "산업별" 옵션 추가

---

## 4. F5. 규제·감사 대응 Agent 고도화 상세 설계

### 4.1 목표

- **감사 추적(Audit Trail)** 자동 생성
- **규제 준수 검증** 도구
- **근거 패키지** 자동 생성
- **보고서 자동 포맷팅**

### 4.2 Agent 도구 추가 (4개)

#### 4.2.1 `generate_audit_trail`

```typescript
{
  name: "generate_audit_trail",
  description: "특정 Discovery의 전체 감사 추적 보고서를 생성합니다. 모든 상태 변경, 의사결정, 근거를 타임라인으로 정리합니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId"],
    properties: {
      discoveryId: { type: "string" },
      format: {
        type: "string",
        enum: ["json", "markdown", "html"],
        default: "markdown"
      },
      dateRange: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO 날짜 (YYYY-MM-DD)" },
          to: { type: "string" }
        }
      },
      includeConversations: { type: "boolean", default: false }
    }
  }
}
```

**구현 로직** (`app/lib/agent/tools/compliance-tools.ts`):
```typescript
export async function generateAuditTrail(
  db: D1Database,
  discoveryId: string,
  options: { format: string; dateRange?: { from: string; to: string }; includeConversations: boolean }
) {
  // 1. event_logs 조회 (시간순)
  // 2. experiments, evidence 변경 이력 수집
  // 3. gate_packages, gate_approvals 이력 수집
  // 4. (선택) messages 테이블에서 관련 대화 수집
  // 5. 타임라인 구조화
  // 6. 포맷에 맞게 출력
}
```

#### 4.2.2 `check_regulatory_compliance`

```typescript
{
  name: "check_regulatory_compliance",
  description: "Discovery가 해당 산업의 규제 요건을 충족하는지 검증합니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId"],
    properties: {
      discoveryId: { type: "string" },
      checklistOnly: { type: "boolean", default: false },
      autoFix: { type: "boolean", default: false }
    }
  }
}
```

**출력 예시**:
```json
{
  "discoveryId": "disc_xxx",
  "industry": "finance",
  "overallCompliance": 85,
  "checks": [
    { "requirement": "KYC 관련 근거 필수", "status": "pass", "evidenceIds": ["ev_1", "ev_2"] },
    { "requirement": "리스크 평가 Method 실행", "status": "fail", "suggestion": "Risk Matrix Method Pack 실행 권장" },
    { "requirement": "정보보호 영향 평가", "status": "warning", "note": "ISMS 관련 근거 보강 필요" }
  ],
  "missingRequirements": ["리스크 평가 Method 실행"],
  "recommendations": [...]
}
```

#### 4.2.3 `package_evidence_for_audit`

```typescript
{
  name: "package_evidence_for_audit",
  description: "감사 대응을 위한 근거 패키지를 생성합니다. 관련 Evidence, 첨부파일, 타임라인을 ZIP으로 묶습니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId"],
    properties: {
      discoveryId: { type: "string" },
      auditType: {
        type: "string",
        enum: ["internal", "external", "regulatory", "national_assembly"],
        description: "감사 유형"
      },
      includeAttachments: { type: "boolean", default: true },
      includeTimeline: { type: "boolean", default: true }
    }
  }
}
```

**출력**: R2 Storage URL (ZIP 파일) 또는 Markdown 요약

#### 4.2.4 `format_compliance_report`

```typescript
{
  name: "format_compliance_report",
  description: "규제 준수 보고서를 표준 양식으로 포맷팅합니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId", "reportType"],
    properties: {
      discoveryId: { type: "string" },
      reportType: {
        type: "string",
        enum: ["executive_summary", "detailed_audit", "gate_review", "compliance_checklist"],
        description: "보고서 유형"
      },
      outputFormat: {
        type: "string",
        enum: ["markdown", "html", "pdf_template"],
        default: "markdown"
      },
      language: {
        type: "string",
        enum: ["ko", "en"],
        default: "ko"
      }
    }
  }
}
```

### 4.3 TOOL_MIN_AUTONOMY 설정

```typescript
// 신규 도구 자율도 레벨
export const TOOL_MIN_AUTONOMY_ADDITIONS = {
  // F3: 로그 자산화
  extract_decision_pattern: 2,
  apply_reusable_rule: 3,

  // F1: Industry Adapter
  get_industry_context: 1,

  // F5: 규제·감사 대응
  generate_audit_trail: 1,
  check_regulatory_compliance: 1,
  package_evidence_for_audit: 2,
  format_compliance_report: 2,
};
```

---

## 5. 구현 순서

### 5.1 Phase 1-A: 스키마 마이그레이션 (1차)

```
0001_add_industry_adapters.sql
├── industry_adapters 테이블 생성
├── industry_rules 테이블 생성
└── discoveries.industry_adapter_id 컬럼 추가

0002_add_decision_logs.sql
├── decision_logs 테이블 생성
├── extracted_patterns 테이블 생성
└── reusable_rules 테이블 생성
```

### 5.2 Phase 1-B: 시드 데이터

```typescript
// 1. Industry Adapter 5개 시드
// 2. 기본 Industry Rules 시드 (산업별 3~5개)
```

### 5.3 Phase 1-C: Agent 도구 구현

```
app/lib/agent/tools/
├── compliance-tools.ts (신규) — F5 도구 4개
├── asset-tools.ts (신규) — F3 도구 2개
└── query-tools.ts (수정) — get_industry_context 추가

app/lib/agent/tool-registry.ts (수정)
└── 신규 8개 도구 등록 + TOOL_MIN_AUTONOMY 추가
```

### 5.4 Phase 1-D: Cron 작업

```
app/routes/
├── api.cron.log-archive.ts (신규)
└── api.cron.pattern-extract.ts (신규)
```

### 5.5 Phase 1-E: UI 확장

```
app/routes/
├── discoveries.$id.patterns.tsx (신규)
├── discoveries.$id.compliance.tsx (신규)
└── dashboard.assets.tsx (신규)

app/components/
├── compliance/AuditTimeline.tsx (신규)
├── compliance/ComplianceChecklist.tsx (신규)
├── industry/IndustrySelector.tsx (신규)
└── patterns/PatternCard.tsx (신규)
```

---

## 6. 테스트 계획

### 6.1 Unit 테스트

| 영역 | 테스트 파일 | 테스트 케이스 |
|------|------------|-------------|
| Industry Adapter | `industry-adapter.test.ts` | CRUD, 규칙 적용, 계층 구조 |
| Decision Logs | `decision-logs.test.ts` | 로그 생성, 압축, 아카이브 |
| Pattern Extraction | `pattern-extract.test.ts` | 패턴 추출, 유사도 계산 |
| Compliance Tools | `compliance-tools.test.ts` | 4개 도구 각각 |

### 6.2 Integration 테스트

| 시나리오 | 설명 |
|---------|------|
| 금융권 Discovery 생명주기 | 생성 → 규제 검증 → Gate → 감사 추적 생성 |
| 패턴 추출 → 규칙 적용 | 성공 패턴 추출 → 다른 Discovery에 적용 |
| 국정감사 대응 패키지 | 근거 패키지 생성 → 보고서 포맷팅 |

---

## 7. 성공 지표

| 지표 | 기준 |
|------|------|
| 신규 테이블 | 6개 (plan 대비 +1 rules 테이블) |
| 신규 Agent 도구 | 8개 (45→53) |
| 신규 Cron 작업 | 2개 |
| 신규 라우트 | 3개 |
| 테스트 커버리지 | 신규 코드 80% 이상 |

---

## 8. 의존성 및 제약

### 8.1 의존성

- Drizzle ORM (현재 사용 중)
- Claude API tool_use (현재 사용 중)
- Cloudflare D1/R2 (현재 사용 중)

### 8.2 제약

- PDF 생성은 서버사이드 제약으로 HTML 템플릿 → 클라이언트 다운로드 방식
- 대용량 로그 압축은 Cloudflare Workers 메모리 제약 (128MB) 고려

---

## 참조 문서

- Plan: `docs/01-plan/features/dx-strategic-evolution.plan.md`
- 현재 스키마: `app/db/schema.ts` (30개 테이블)
- Agent 도구: `app/lib/agent/tool-registry.ts` (45개)

---

*Design 작성일: 2026-02-05*
*PDCA Feature: dx-strategic-evolution*
