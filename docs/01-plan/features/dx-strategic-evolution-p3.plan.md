# Discovery-X 전략적 진화 Phase 3 계획서

> Phase 1 (F3+F1+F5), Phase 2 (F2+F4) 완료 기반, Layer 3 확장 기반 구축

## 1. 배경

### 1.1 Phase 1+2 완료 현황

| Phase | 기능 | Match Rate | 주요 산출물 |
|-------|------|-----------|------------|
| Phase 1 | F3 (로그 자산화) + F1 (Industry Adapter) + F5 (규제/감사) | 96.3% | 6 테이블, 10 도구, 2 Cron |
| Phase 2 | F2 (Shadow Mode) + F4 (Value-up Engine) | 93.4% | 6 테이블, 7 도구, 1 Cron |

### 1.2 현재 시스템 규모

| 지표 | 값 |
|------|-----|
| DB 테이블 | 42 |
| Agent 도구 | 62 (12개 파일) |
| Cron 작업 | 8 |
| 라우트 | ~82 |
| 테스트 | 561 |
| 사용자 모델 | Single-tenant, 4개 역할 (admin/gatekeeper/user/pending) |

### 1.3 Phase 3 목적

**L3 확장 기반 구축**: Discovery-X를 단일 조직 내부 도구에서 **다중 조직이 사용 가능한 플랫폼**으로 전환

- 조직 단위 데이터 격리로 외부 고객 수용 가능
- 조직별 설정/브랜딩으로 White-label 기반 마련
- 교차 분석 옵션으로 벤치마크 데이터 축적

---

## 2. F6. Multi-Tenant 기반 구조

### 2.1 현재 상태 분석

**Single-Tenant 구조**:
- `users` 테이블이 전역 (조직 구분 없음)
- 모든 데이터(discoveries, conversations 등)가 `userId` FK로만 연결
- 역할 시스템이 전역 (admin/gatekeeper/user/pending)
- 세션에 조직 컨텍스트 없음
- "tenant", "organization", "workspace" 참조 0건

**User-Owned 리소스 패턴**:
```
discoveries.ownerId → users.id
conversations.userId → users.id
evidence.createdById → users.id
eventLogs.actorId → users.id
valueupAssessments.createdBy → users.id
```

### 2.2 목표

1. **데이터 격리**: 조직별 데이터 완전 분리 (다른 조직의 데이터 접근 불가)
2. **조직별 설정**: 브랜딩, Agent 설정, 산업 어댑터 선택
3. **유연한 역할**: 조직 내 역할 + 전역 역할 분리
4. **비파괴적 마이그레이션**: 기존 데이터 무손실, 기존 사용자 경험 유지

### 2.3 설계 방향

#### 2.3.1 Tenant 모델

```
tenants (신규)
├── id: TEXT PK
├── name: 조직명
├── slug: URL-safe 식별자 (unique)
├── settings: JSON (브랜딩, 기능 토글, 제한)
├── plan: 'free' | 'starter' | 'pro' | 'enterprise'
├── status: 'active' | 'suspended' | 'trial'
├── created_at, updated_at
└── owner_user_id → users.id
```

#### 2.3.2 Membership 모델

```
tenant_members (신규)
├── id: TEXT PK
├── tenant_id → tenants.id
├── user_id → users.id
├── role: 'owner' | 'admin' | 'gatekeeper' | 'member' | 'viewer'
├── joined_at, invited_by
└── UNIQUE(tenant_id, user_id)
```

#### 2.3.3 tenant_id FK 추가 대상

**Tier 1 — 핵심 엔티티** (Phase 3-A):
- `discoveries` + `experiments` + `evidence` + `eventLogs`
- `conversations` + `messages`

**Tier 2 — 기능 테이블** (Phase 3-B):
- `radarSources` + `radarItems` + `radarRuns`
- `methodRuns` + `gatePackages` + `gateApprovals`
- `contextNodes` + `contextEdges`
- `discoveryKpis` + `kpiMeasurements`

**Tier 3 — 확장 테이블** (Phase 3-C):
- `decisionLogs` + `extractedPatterns` + `reusableRules`
- `shadowRuns` + `shadowConfigs`
- `valueupAssessments` + `valueupScores` + `valueupScenarios` + `valueupChecklists`
- `industryAdapters` + `industryRules`
- `alertRules` + `alerts` + `webhookConfigs`
- `discoveryLinks`

**제외 — 전역 테이블**:
- `users`, `sessions` (전역 인증)
- `stages`, `methodPacks`, `ontologyTypes` (시스템 메타데이터)
- `agentConfig` (전역 설정, 추후 조직별 오버라이드 고려)

### 2.4 구현 항목

#### 데이터 모델 (2개 신규 + ~25개 ALTER)

- [ ] `tenants` 테이블 생성
- [ ] `tenant_members` 테이블 생성
- [ ] 주요 테이블에 `tenant_id` 컬럼 추가 (ALTER TABLE)
- [ ] 복합 인덱스 추가 (tenant_id + 기존 인덱스)
- [ ] 기존 데이터를 기본 Tenant에 할당하는 마이그레이션

#### 인증/세션 확장

- [ ] 세션 쿠키에 `tenantId` 포함
- [ ] `getTenantFromSession()` 헬퍼 추가
- [ ] `requireTenantMember()` 가드 추가
- [ ] 조직 전환 UI (멀티 조직 소속 사용자)

#### 쿼리 패턴 변경

- [ ] 데이터 조회 시 `WHERE tenant_id = :tenantId` 자동 필터
- [ ] Agent 도구에 tenant 스코프 적용
- [ ] Cron 작업에 tenant 루프 적용

#### UI

- [ ] `/settings/organization` — 조직 설정 페이지
- [ ] 조직 전환 드롭다운 (TopNav 또는 AppShell)
- [ ] 초대/멤버 관리 UI
- [ ] 온보딩 플로우 (조직 생성 → 초대)

#### Agent 확장

- [ ] 조직별 Agent 설정 오버라이드
- [ ] `get_tenant_info` 도구 추가
- [ ] `manage_tenant_members` 도구 추가

---

## 3. 구현 우선순위

### 3.1 Sub-Phase 분할

Multi-Tenant는 높은 난이도와 넓은 영향 범위를 가지므로 **3개 Sub-Phase**로 분할:

| Sub-Phase | 내용 | 난이도 | 추정 영향 테이블 |
|-----------|------|--------|----------------|
| **3-A** | 기반 구축 (tenants, members, 핵심 FK, 세션) | 높음 | 2 신규 + 6 ALTER |
| **3-B** | 기능 테이블 확장 + 쿼리 패턴 | 중 | ~10 ALTER |
| **3-C** | 확장 테이블 + UI + Agent | 중 | ~12 ALTER + UI |

### 3.2 Phase 3-A 상세 (우선 구현)

```
1. tenants + tenant_members 테이블 생성
2. users 테이블에 default_tenant_id 추가
3. discoveries, experiments, evidence, eventLogs에 tenant_id 추가
4. conversations, messages에 tenant_id 추가
5. 기본 Tenant 생성 마이그레이션 (기존 데이터 할당)
6. 세션에 tenantId 포함
7. requireTenantMember() 가드
8. Loader/Action에 tenant 스코프 적용 (핵심 라우트)
```

### 3.3 Phase 3-B 상세

```
1. Radar, Method, Gate, Ontology, KPI 테이블에 tenant_id 추가
2. Agent 도구 쿼리에 tenant 필터 삽입
3. Cron 작업에 tenant 루프 적용
4. 복합 인덱스 최적화
```

### 3.4 Phase 3-C 상세

```
1. Decision Logs, Patterns, Shadow, Value-up, Alerts 등에 tenant_id 추가
2. /settings/organization 라우트
3. 조직 전환 UI
4. 멤버 초대/관리 UI
5. 조직 온보딩 플로우
6. Agent 도구 2개 (get_tenant_info, manage_tenant_members)
```

---

## 4. 기술적 고려사항

### 4.1 마이그레이션 전략

**비파괴적 접근**:
1. `tenant_id` 컬럼을 NULL 허용으로 추가 (ALTER TABLE ADD COLUMN)
2. 기본 Tenant 생성 (`default-tenant`)
3. 기존 모든 레코드에 기본 tenant_id 할당 (UPDATE)
4. `tenant_id`를 NOT NULL로 변경 (가능 시)
5. 신규 레코드는 세션의 tenantId 사용

**D1/SQLite 제약**:
- ALTER TABLE ADD COLUMN은 지원되지만 ALTER COLUMN은 미지원
- NOT NULL 변경이 필요하면 테이블 재생성 필요 (복잡도 높음)
- 따라서 **NULL 허용 + 앱 레벨 검증** 전략 권장

### 4.2 쿼리 패턴

**현재 패턴** (tenant 없음):
```typescript
const results = await db.select().from(discoveries)
  .where(eq(discoveries.ownerId, userId));
```

**목표 패턴** (tenant 스코프):
```typescript
const results = await db.select().from(discoveries)
  .where(and(
    eq(discoveries.tenantId, tenantId),
    eq(discoveries.ownerId, userId)
  ));
```

**고려 옵션**: `withTenantScope(db, tenantId)` 헬퍼로 일괄 적용

### 4.3 세션 확장

**현재 세션**:
```typescript
{ userId: string }
```

**확장 세션**:
```typescript
{ userId: string; tenantId: string; tenantRole: string }
```

### 4.4 역할 체계 전환

| 현재 (전역) | 목표 (테넌트 내) | 설명 |
|------------|----------------|------|
| admin | owner / admin | 조직 관리 |
| gatekeeper | gatekeeper | Gate 심사 권한 |
| user | member | 일반 사용자 |
| pending | viewer | 읽기 전용 |
| - | (전역 super_admin) | 플랫폼 관리자 |

### 4.5 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| ALTER TABLE 대량 수행 시 D1 마이그레이션 복잡도 | 높음 | 단계별 마이그레이션, 롤백 스크립트 준비 |
| 기존 쿼리 누락 (tenant 필터 미적용) | 높음 | 중앙화된 헬퍼 함수, 린트 규칙 |
| 세션 마이그레이션 | 중 | 기존 세션 무효화 + 재로그인 유도 |
| 성능 저하 (복합 인덱스) | 중 | tenant_id를 인덱스 첫 번째 컬럼으로 |
| Agent 도구 62개 일괄 수정 | 높음 | executor에서 tenantId 자동 주입 패턴 |

---

## 5. 성공 기준

### 5.1 정량 지표

| 지표 | Before | Target |
|------|--------|--------|
| DB 테이블 | 42 | 44 (+2 신규) |
| ALTER 대상 테이블 | 0 | ~25개 (tenant_id 추가) |
| Agent 도구 | 62 | 64 (+2) |
| 신규 라우트 | ~82 | ~86 (+4) |
| 테넌트 지원 | 0 | 1+ (기본 + 테스트) |

### 5.2 정성 지표

- [ ] 기존 단일 조직 사용자 경험 변화 없음 (비파괴적 마이그레이션)
- [ ] 새 조직 생성 → 초대 → 데이터 격리 확인
- [ ] Agent 대화가 조직 스코프 내에서만 데이터 접근
- [ ] 조직 전환 시 데이터가 올바르게 필터링

---

## 6. 다음 단계

1. 이 계획서 승인 후 `/pdca design dx-strategic-evolution-p3` 실행
2. Phase 3-A (기반 구축) 상세 설계 우선 진행
3. Phase 1+2 archive: `/pdca archive dx-strategic-evolution --summary`

---

*Plan 작성일: 2026-02-06*
*PDCA Feature: dx-strategic-evolution-p3*
*전제: Phase 1 (96.3%) + Phase 2 (93.4%) 완료*
