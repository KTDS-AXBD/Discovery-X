---
code: DX-DSGN-100
title: 문서 관리 표준 및 적용 계획
version: 1.0
status: Draft
category: DSGN
tags: [governance, documentation, standard]
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# 문서 관리 표준 & Discovery-X 적용 계획

## Part 1. 문서 관리 표준 (범용)

이 표준은 프로젝트에 종속되지 않는 범용 문서 관리 체계이다.

### 1. 문서코드

#### 포맷

```
{PROJECT}-{TYPE}-{NNN}
```

| 요소 | 규칙 | 예시 |
|------|------|------|
| `PROJECT` | 프로젝트 약어 (2~4자, 대문자) | DX, RW, AX |
| `TYPE` | 문서 유형 코드 (아래 표) | SPEC, PLAN, DSGN |
| `NNN` | 유형별 일련번호 (001부터) | 001, 002, ... |

#### 문서 유형 코드

| 코드 | 의미 | 대상 |
|------|------|------|
| `SPEC` | 사양 | PRD, 기획서, 요구사항, 프레임워크 명세 |
| `PLAN` | 계획 | 피처 계획, 작업 계획, 로드맵 |
| `DSGN` | 설계 | 피처 설계, 아키텍처 결정, 기술 전략 |
| `ANLS` | 분석 | 갭 분석, 코드 분석, 진단 보고 |
| `RPRT` | 보고 | 완료 보고서, 결과 보고 |
| `GUID` | 가이드 | 사용자 매뉴얼, 운영 런북, QA 체크리스트 |
| `OPS` | 운영 | Cron 관리, 인프라 설정, 배포 가이드 |

#### 부여 규칙

- 일련번호는 유형별로 독립 채번 (SPEC-001과 PLAN-001은 별개)
- 한 번 부여된 코드는 변경/재사용하지 않음
- 아카이브된 문서도 코드 유지 (결번 허용)

### 2. 파일명

#### 포맷

```
{PROJECT}-{TYPE}-{NNN}_{설명}.md
```

- 설명 부분은 kebab-case (소문자 + 하이픈)
- 예시: `DX-DSGN-003_msa-refactoring-plan.md`

#### 금지 패턴

- PascalCase, UPPER_CASE, 한국어, 공백, 언더스코어(코드-설명 구분자 제외)

### 3. 메타데이터

모든 문서 상단에 YAML frontmatter로 기록:

```yaml
---
code: DX-GUID-001
title: 사용자 가이드
version: 2.1
status: Active
category: GUID
tags: [user, onboarding]
created: 2026-02-20
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=6.27"
related: [DX-SPEC-001]
---
```

#### 필수 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `code` | 문서코드 | `DX-SPEC-004` |
| `title` | 문서 제목 | `Discovery-X PRD v3.1` |
| `version` | 문서 버전 | `1.0`, `2.1`, `3.1` |
| `status` | 상태 | `Draft` / `Active` / `Archived` / `Superseded` |
| `category` | 유형 코드 | `SPEC`, `PLAN`, `DSGN` 등 |
| `created` | 작성일 | `2026-03-07` |
| `updated` | 최종 수정일 | `2026-03-07` |
| `author` | 작성자 | `Sinclair Seo` |

#### 선택 필드

| 필드 | 설명 | 예시 |
|------|------|------|
| `system-version` | 유효한 시스템 버전 (아래 연동 규칙 참조) | `">=6.27"`, `"6.29"` |
| `tags` | 교차 분류 태그 | `[prd, requirements]` |
| `related` | 관련 문서코드 목록 | `[DX-SPEC-003, DX-PLAN-001]` |
| `supersedes` | 이 문서가 대체하는 구 문서 | `DX-SPEC-003` |
| `superseded-by` | 이 문서를 대체한 신 문서 | `DX-SPEC-005` |

### 문서 버전 관리

#### 버전 포맷: `{Major}.{Minor}`

| 변경 수준 | 버전 증가 | 예시 |
|-----------|-----------|------|
| 구조/범위 변경, 전면 재작성 | Major +1 | `1.0` → `2.0` |
| 내용 보강, 부분 수정, 오류 정정 | Minor +1 | `2.0` → `2.1` |

#### 버전 이력 관리

문서 내에 변경 이력 섹션을 유지한다:

```markdown
## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 3.1 | 2026-03-07 | 온톨로지 섹션 추가 |
| 3.0 | 2026-03-01 | PRD v3 전면 개정 |
| 2.0 | 2026-02-15 | 스프린트 구조 반영 |
```

#### 버전 대체 규칙

- Major 버전 변경 시: 새 문서코드 발급, 구 문서에 `superseded-by` 기록
  - 예: `DX-SPEC-003` (v3.0) → `DX-SPEC-004` (v3.1)
- Minor 버전 변경 시: 같은 문서코드 유지, `version`과 `updated` 필드만 갱신
- `supersedes` / `superseded-by`는 항상 쌍으로 관리

### 시스템 버전 연동

문서 버전과 시스템 버전은 별도 체계이지만, 문서 유효성 확인을 위해 연동한다.

#### 연동 수준 (유형별)

| 유형 | `system-version` | 이유 |
|------|:-----------------:|------|
| `SPEC` | 필수 | PRD/요구사항이 어느 시스템 버전까지 반영됐는지 추적 |
| `GUID` | 필수 | 사용자 가이드가 현재 시스템과 일치해야 함 |
| `OPS` | 필수 | 운영 문서가 현재 인프라와 맞아야 함 |
| `DSGN` | 선택 | 미래 피처 설계는 "아직 없는 버전"을 다루므로 불필요할 수 있음 |
| `PLAN` | 불필요 | 계획 시점 스냅샷 — `created` 날짜로 충분 |
| `ANLS` | 불필요 | 시점 산출물 — `created` 날짜로 충분 |
| `RPRT` | 불필요 | 시점 산출물 — `created` 날짜로 충분 |

#### `system-version` 표기 방식

| 표기 | 의미 | 용도 |
|------|------|------|
| `"6.29"` | 특정 버전에 대한 문서 | 릴리스 노트, 특정 버전 스펙 |
| `">=6.27"` | 이 버전 이상에서 유효 | 가이드, 운영 문서 |
| `"6.20~6.29"` | 범위 지정 | 특정 기간 동안만 유효한 문서 |

#### 점검 시점

- 시스템 Major 버전 업데이트 시: `system-version` 필드가 있는 문서를 점검
- `grep -r 'system-version:' docs/` → 연동 대상 문서 일괄 조회

### 4. 문서 간 참조 (Wikilink)

본문에서 다른 문서를 참조할 때 `[[문서코드]]` 형식을 사용한다:

```markdown
이 설계는 [[DX-SPEC-004]]를 기반으로 한다.
갭 분석 결과는 [[DX-ANLS-001]] 참조.
```

- GitHub에서는 렌더링되지 않지만, grep으로 역참조 추적 가능
- `grep -r '\[\[DX-SPEC-004\]\]' docs/` → 이 문서를 참조하는 모든 문서 검색

### 5. 상태 정의

| 상태 | 의미 | 위치 |
|------|------|------|
| Draft | 작성 중 | 해당 폴더 |
| Active | 확정·유효 | 해당 폴더 |
| Archived | 완료/폐기 | archive/ |
| Superseded | 새 버전으로 대체 | archive/superseded/ (후속 코드 명시) |

### 6. 폴더 구조

```
docs/
├── specs/         # SPEC — 사양·요구사항
├── 01-plan/       # PLAN — 계획
├── 02-design/     # DSGN — 설계·아키텍처
├── 03-analysis/   # ANLS — 분석
├── 04-report/     # RPRT — 보고
├── guides/        # GUID — 가이드
├── ops/           # OPS  — 운영
├── archive/       # 보관 (완료/폐기/대체)
├── assets/        # 비-Markdown 원본 (xlsx, docx, png)
├── CHANGELOG.md   # 변경 이력 (코드 없음)
└── INDEX.md       # 문서 인덱스 (코드 없음)
```

#### 폴더 규칙

1. **폴더 = 유형**: 문서코드 TYPE과 폴더가 1:1 대응
2. **플랫 구조**: 폴더 내 서브디렉토리 금지 (archive/ 제외)
3. **루트 제한**: `docs/` 루트에는 CHANGELOG.md, INDEX.md만 허용
4. **archive 구조**: `archive/{yyyy-mm}/` 월별 또는 `archive/superseded/`

### 7. INDEX.md

전체 문서 목록을 유형별로 관리. 문서 추가/이동/삭제 시 함께 갱신.

```markdown
# 문서 인덱스
> 최종 갱신: {날짜}

## SPEC — 사양
| 코드 | 파일명 | 상태 | 설명 |
|------|--------|------|------|
| DX-SPEC-001 | DX-SPEC-001_discovery-x-v1.4.md | Active | 비즈니스 기획서 |

## PLAN — 계획
| 코드 | 파일명 | 상태 | 설명 |
...
```

### 8. 아카이브 기준

| 조건 | 처리 |
|------|------|
| PDCA 완료 (RPRT 작성 후) | 해당 피처의 PLAN+DSGN+ANLS+RPRT → `archive/{yyyy-mm}/` |
| 문서 버전 대체 | 구 버전 → `archive/superseded/`, 메타에 후속 코드 명시 |
| 6개월 이상 미갱신 Draft | 검토 후 archive 또는 삭제 |

---

## Part 2. Discovery-X 적용 계획

프로젝트 코드: **DX**

### 문서코드 채번표

#### SPEC (specs/)

| 코드 | 현재 파일명 | 새 파일명 | 상태 |
|------|------------|-----------|------|
| DX-SPEC-001 | `Discovery-X_v1.4.md` | `DX-SPEC-001_discovery-x-v1.4.md` | Active |
| DX-SPEC-002 | `Discovery-X_Prototype_PRD_v0.1.md` | `DX-SPEC-002_discovery-x-prototype-prd.md` | Active |
| DX-SPEC-003 | `Discovery-X_PRD_v3_Final.md` | `DX-SPEC-003_discovery-x-prd-v3.md` | Active |
| DX-SPEC-004 | (루트) `Discovery-X_PRD_v3.1.md` | `DX-SPEC-004_discovery-x-prd-v3.1.md` | Active |
| DX-SPEC-005 | `Venture_Discovery_Sprint_PRD_v0.2.md` | `DX-SPEC-005_venture-sprint-prd-v0.2.md` | Active |
| DX-SPEC-006 | `Venture_Discovery_Sprint_PRD_v0.3_DevSpec.md` | `DX-SPEC-006_venture-sprint-prd-v0.3-devspec.md` | Active |
| DX-SPEC-007 | `DiscoveryX_Framework_ArchMapping_v1.md` | `DX-SPEC-007_framework-arch-mapping-v1.md` | Active |
| DX-SPEC-008 | `DiscoveryX_Framework_DBSchema_v1.md` | `DX-SPEC-008_framework-db-schema-v1.md` | Active |
| DX-SPEC-009 | `KTDS_AX_DiscoveryX_Framework_DevPlan.md` | `DX-SPEC-009_framework-devplan.md` | Active |
| DX-SPEC-010 | `AX BD팀 요구사항_v0.2.md` | `DX-SPEC-010_ax-bd-requirements-v0.2.md` | Active |
| DX-SPEC-011 | (루트) `Discovery-X_요구사항_정리.md` | `DX-SPEC-011_requirements-summary.md` | Active |

#### PLAN (01-plan/)

| 코드 | 현재 파일명 | 새 파일명 | 상태 |
|------|------------|-----------|------|
| DX-PLAN-001 | `f20-ideas-enhancement.plan.md` | `DX-PLAN-001_ideas-enhancement.md` | Active |
| DX-PLAN-002 | `f21-dashboard-charts.plan.md` | `DX-PLAN-002_dashboard-charts.md` | Active |
| DX-PLAN-003 | `f22-archive-folders.plan.md` | `DX-PLAN-003_archive-folders.md` | Active |
| DX-PLAN-004 | `ontology-intelligence.plan.md` | `DX-PLAN-004_ontology-intelligence.md` | Active |

#### DSGN (02-design/)

| 코드 | 현재 파일명 | 새 파일명 | 원래 위치 |
|------|------------|-----------|-----------|
| DX-DSGN-001 | `f20-ideas-enhancement.design.md` | `DX-DSGN-001_ideas-enhancement.md` | 02-design/features/ |
| DX-DSGN-002 | `f21-dashboard-charts.design.md` | `DX-DSGN-002_dashboard-charts.md` | 02-design/features/ |
| DX-DSGN-003 | `f22-archive-folders.design.md` | `DX-DSGN-003_archive-folders.md` | 02-design/features/ |
| DX-DSGN-004 | `ontology-intelligence.design.md` | `DX-DSGN-004_ontology-intelligence.md` | 02-design/features/ |
| DX-DSGN-005 | `idea-analysis-pipeline-v2.md` | `DX-DSGN-005_idea-analysis-pipeline-v2.md` | designs/ |
| DX-DSGN-006 | `MSA-Refactoring-Plan.md` | `DX-DSGN-006_msa-refactoring-plan.md` | 루트 |
| DX-DSGN-007 | `Ontology-Activation-Plan.md` | `DX-DSGN-007_ontology-activation-plan.md` | 루트 |
| DX-DSGN-008 | `radar-scoring-strategy.md` | `DX-DSGN-008_radar-scoring-strategy.md` | architecture/ |
| DX-DSGN-100 | (이 문서) | `DX-DSGN-100_doc-governance-plan.md` | designs/ |

#### ANLS (03-analysis/)

| 코드 | 현재 파일명 | 새 파일명 | 상태 |
|------|------------|-----------|------|
| DX-ANLS-001 | `f20-ideas-enhancement.analysis.md` | `DX-ANLS-001_ideas-enhancement.md` | Active |
| DX-ANLS-002 | `f22-archive-folders.analysis.md` | `DX-ANLS-002_archive-folders.md` | Active |
| DX-ANLS-003 | `layout-proposals.analysis.md` | `DX-ANLS-003_layout-proposals.md` | Active |
| DX-ANLS-004 | `ontology-intelligence.analysis.md` | `DX-ANLS-004_ontology-intelligence.md` | Active |

#### RPRT (04-report/)

| 코드 | 현재 파일명 | 새 파일명 | 상태 |
|------|------------|-----------|------|
| DX-RPRT-001 | `f20-ideas-enhancement.report.md` | `DX-RPRT-001_ideas-enhancement.md` | Active |
| DX-RPRT-002 | `f22-archive-folders.report.md` | `DX-RPRT-002_archive-folders.md` | Active |
| DX-RPRT-003 | `layout-proposals.report.md` | `DX-RPRT-003_layout-proposals.md` | Active |
| DX-RPRT-004 | `ontology-intelligence.report.md` | `DX-RPRT-004_ontology-intelligence.md` | 04-report/features/ |

#### GUID (guides/)

| 코드 | 현재 파일명 | 새 파일명 | 상태 |
|------|------------|-----------|------|
| DX-GUID-001 | `user-guide.md` | `DX-GUID-001_user-guide.md` | Active |
| DX-GUID-002 | `OPERATIONAL_RUNBOOK.md` | `DX-GUID-002_operational-runbook.md` | Active |
| DX-GUID-003 | `USER_CHEAT_SHEET.md` | `DX-GUID-003_user-cheat-sheet.md` | Active |
| DX-GUID-004 | `KICKOFF_TEMPLATE.md` | `DX-GUID-004_kickoff-template.md` | Active |
| DX-GUID-005 | `qa-checklist.md` | `DX-GUID-005_qa-checklist.md` | Active |

#### OPS (ops/)

| 코드 | 현재 파일명 | 새 파일명 | 상태 |
|------|------------|-----------|------|
| DX-OPS-001 | `cron-registration-guide.md` | `DX-OPS-001_cron-registration-guide.md` | Active |

### 아카이브 처리

| 현재 위치 | 이동 | 사유 |
|-----------|------|------|
| `docs/refactoring-plan.md` | `archive/2026-02/` | v6.18 기준 분석, 현재 v6.29 |
| `docs/backlog-session-210.md` | `archive/2026-02/` | 세션 210 스냅샷, 대부분 소화 |
| `archive/wireframes-v5/` (3 png) | `assets/wireframes-v5/` | 원본 자산 → assets로 이동 |
| Zone.Identifier 2개 | **삭제** | Windows 아티팩트 |

> archive/2026-02/ 내부 기존 파일 (7개 피처 세트)은 리네이밍하지 않음 (이미 아카이브됨).

### 폴더 변경 요약

| 작업 | 상세 |
|------|------|
| `designs/` 폴더 해체 | 내용물 → `02-design/`, 빈 폴더 삭제 |
| `architecture/` 폴더 해체 | 내용물 → `02-design/`, 빈 폴더 삭제 |
| `*/features/` 서브 해체 | `01-plan/features/`, `02-design/features/`, `04-report/features/` 플랫화 |

### 참조 파일 갱신

| 파일 | 변경 내용 |
|------|-----------|
| `CLAUDE.md` | docs 참조 경로 갱신 (specs/ 파일명 변경 반영) |
| `README.md` | 문서 테이블 갱신 (새 파일명 + 코드) |

### 최종 구조

```
docs/
├── INDEX.md
├── CHANGELOG.md
│
├── specs/
│   ├── DX-SPEC-001_discovery-x-v1.4.md
│   ├── DX-SPEC-002_discovery-x-prototype-prd.md
│   ├── DX-SPEC-003_discovery-x-prd-v3.md
│   ├── DX-SPEC-004_discovery-x-prd-v3.1.md
│   ├── DX-SPEC-005_venture-sprint-prd-v0.2.md
│   ├── DX-SPEC-006_venture-sprint-prd-v0.3-devspec.md
│   ├── DX-SPEC-007_framework-arch-mapping-v1.md
│   ├── DX-SPEC-008_framework-db-schema-v1.md
│   ├── DX-SPEC-009_framework-devplan.md
│   ├── DX-SPEC-010_ax-bd-requirements-v0.2.md
│   └── DX-SPEC-011_requirements-summary.md
│
├── 01-plan/
│   ├── DX-PLAN-001_ideas-enhancement.md
│   ├── DX-PLAN-002_dashboard-charts.md
│   ├── DX-PLAN-003_archive-folders.md
│   └── DX-PLAN-004_ontology-intelligence.md
│
├── 02-design/
│   ├── DX-DSGN-001_ideas-enhancement.md
│   ├── DX-DSGN-002_dashboard-charts.md
│   ├── DX-DSGN-003_archive-folders.md
│   ├── DX-DSGN-004_ontology-intelligence.md
│   ├── DX-DSGN-005_idea-analysis-pipeline-v2.md
│   ├── DX-DSGN-006_msa-refactoring-plan.md
│   ├── DX-DSGN-007_ontology-activation-plan.md
│   ├── DX-DSGN-008_radar-scoring-strategy.md
│   └── DX-DSGN-100_doc-governance-plan.md
│
├── 03-analysis/
│   ├── DX-ANLS-001_ideas-enhancement.md
│   ├── DX-ANLS-002_archive-folders.md
│   ├── DX-ANLS-003_layout-proposals.md
│   └── DX-ANLS-004_ontology-intelligence.md
│
├── 04-report/
│   ├── DX-RPRT-001_ideas-enhancement.md
│   ├── DX-RPRT-002_archive-folders.md
│   ├── DX-RPRT-003_layout-proposals.md
│   └── DX-RPRT-004_ontology-intelligence.md
│
├── guides/
│   ├── DX-GUID-001_user-guide.md
│   ├── DX-GUID-002_operational-runbook.md
│   ├── DX-GUID-003_user-cheat-sheet.md
│   ├── DX-GUID-004_kickoff-template.md
│   └── DX-GUID-005_qa-checklist.md
│
├── ops/
│   └── DX-OPS-001_cron-registration-guide.md
│
├── archive/
│   └── 2026-02/             # (기존 아카이브 + 정리된 파일)
│
└── assets/
    ├── wireframes-v5/       # (← archive에서 이동)
    ├── DiscoveryX_Framework_PRD_Final.docx
    ├── DiscoveryX_MethodPacks_Library_v1.2.xlsx
    ├── DiscoveryX_MethodPacks_Ontology_Backlog_v1.2.xlsx
    └── DiscoveryX_MethodPacks_Ontology_Plan_v1.2.docx
```
