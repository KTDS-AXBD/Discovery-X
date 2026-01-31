# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Discovery-X는 AX 신사업을 위한 내부 실험 중심 사고 시스템입니다. 관찰을 행동으로 전환하고, 행동을 근거 있는 문서로 남기며, 실패를 조직 자산으로 축적하는 것을 목표로 합니다.

**현재 상태**: 기획/설계 단계 (v1 Prototype 구현 전)

## 프로젝트 문서 구조

이 프로젝트는 **문서 기반(Spec-Driven Development)**으로 진행됩니다.

### 핵심 문서
- **SPEC.md**: 프로젝트 사양서 (6개 섹션 구조 - 매 세션 업데이트)
- **Discovery-X_v1.4.md**: 최종 기획서 (30-60일 운영 실험 전제)
- **Discovery-X_Prototype_PRD_v0.1.md**: 요구사항 정의서 및 개발 계획

### 문서 우선순위
1. PRD가 구현 요구사항의 최종 기준
2. v1.4 기획서는 비즈니스 컨텍스트 및 운영 전제 제공
3. SPEC.md는 진행 상황 및 현재 단계 기록

## 핵심 시스템 개념

### 주요 엔티티 (PRD §5 참고)
- **Discovery**: 메인 레코드 (Seed → Experiment → Evidence → Decision)
- **Experiment**: Discovery당 최대 2개 (가설 → 최소 행동 → 근거)
- **Evidence**: 근거 기록 (타입/강도/링크)
- **Event Log**: 감사 및 지표 수집

### 상태 전환 규칙
```
INBOX → OPEN → {NEXT | NOT_NOW | DEAD_END}
              ↓
         EXTENSION_REQUESTED (2회 실험 초과 시)
```

### 필수 운영 규칙
- **Single Owner**: Discovery당 책임자 1명 (실험·문서·결정 담당)
- **Time-box**: 최대 4주 또는 실험 2회 내 종료
- **Mandatory Fields**:
  - NOT_NOW: Trigger Type + Revisit Date
  - DEAD_END: Failure Pattern 태깅
  - NEXT: 근거(Evidence) A/B급 최소 2개 권장

## 기술 스택

- **Runtime**: Cloudflare Pages (Edge)
- **Framework**: Remix v2 (Vite)
- **DB**: Cloudflare D1 (SQLite) + Drizzle ORM
- **UI**: React 19 + Tailwind CSS 3
- **Language**: TypeScript (strict)
- **Package Manager**: pnpm

## 버전 관리 원칙

### 브랜치 전략
- **`master` 단일 브랜치**로 운영 (Prototype 기간 동안)
- 모든 커밋은 `master`에 직접 push

### 커밋 컨벤션
[Conventional Commits](https://www.conventionalcommits.org/) 준수:

```
<type>: <description>

[optional body]
```

| type | 용도 |
|------|------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `refactor` | 동작 변경 없는 코드 개선 |
| `style` | 포매팅, 세미콜론 등 |
| `chore` | 빌드, 설정, 의존성 등 |

### 버전 태깅
- Phase 완료 시 태그 부여: `v0.1.0` (Phase 1), `v0.2.0` (Phase 2), `v0.3.0` (Phase 3)
- Phase 내 주요 마일스톤은 patch 버전: `v0.1.1`, `v0.1.2`, ...
- Prototype 종료(30-60일 Gate) 시: `v1.0.0`

### 배포
- `master` push → 수동 배포 (`pnpm deploy`)
- 프리뷰: `/deploy --preview`
- 프로덕션: `/deploy`

## 운영 실험 파라미터 (절대 변경 금지)

PRD §3에 정의된 운영 실험 조건:
- **기간**: 30-60일
- **사용자**: 최대 5명 (전원 Owner 수행 가능)
- **Discovery 목표**: 5-10건 (볼륨이 아니라 "닫힘")
- **미팅**: Weekly Decision Review (30분) + Monthly Failure Replay (30분)
- **강제 사용**: ❌ (참여자는 규칙 준수 필수)

## 성공 기준 (Prototype)

### P0 (최우선)
"닫힌 Discovery"(Next/Not Now/Dead End)가 최소 1건 이상 발생했는가?

### 운영 지표
- Seed → Experiment 전환율
- 28일 내 종료율 ≥ 90%
- Experiment 완료율 ≥ 80%
- 월 1회 이상 재호출 이벤트 발생

## 구현 시 주의사항

### 금지 사항 (PRD §2.2 Non-Goals)
- ❌ 전사 공식 포털/플랫폼 구축
- ❌ 완성형 UX (필수 인지부하는 설계의 일부)
- ❌ 외부 고객/CRM 연동
- ❌ 고급 예측/추천 모델
- ❌ 제품 수준 KPI 대시보드

### 필수 구현 (PRD §7.1 P0)
1. Discovery CRUD + 상태 전환
2. Owner/Reviewer 지정 및 승계
3. Experiment 최대 2개 제한
4. Evidence 타입/강도 관리
5. NOT_NOW/DEAD_END 필수 필드 강제
6. Weekly Review / Recall Queue 뷰
7. 최소 지표 집계/Export

## 설계 원칙 (v1.4 §5)

- **따로 또 같이**: 관점은 병렬, 수렴은 현실에서
- **행동이 완결**: 관찰은 시작, 행동 없으면 자산 아님
- **Single-Threaded Ownership**: 책임 분산 금지
- **Time-boxed Discovery**: 무한 탐구 시스템 아님
- **의도된 인지 부하**: 쉽게 만드는 UX가 목표 아님 (운영/코칭으로 흡수)
- **하나의 뾰족함**: v1은 "내부 실험 + 근거 문서 루프"에만 집중

## 참고 프레임워크

- **Six Thinking Hats**: 반복 쟁점 해결 (v1.4 §2.1)
- **PESTEL**: 외부 환경 내재화 (v1.4 §2.2)

## SDD (Spec Driven Development) 워크플로우

프로젝트 사양서 `SPEC.md`에 설계/아키텍처/현재 상태를 기록하고, 세션 스킬로 관리한다.

### 스킬

| 스킬 | 용도 |
|------|------|
| `/session-start [작업내용]` | SPEC.md에서 프로젝트 컨텍스트 복원 |
| `/session-end [메모]` | Git 커밋 + SPEC.md 업데이트 |
| `/deploy [--preview]` | CLAUDE.md 참조 기반 배포 |

### SPEC.md 구조

| 섹션 | 내용 | 업데이트 빈도 |
|------|------|-------------|
| §1 Project Overview | 미션, 범위, 성공 기준, 대상 사용자 | 드물게 |
| §2 Product Design | 핵심 워크플로우, UI 요소, 페이지 구성 | 기능 추가 시 |
| §3 Architecture Patterns | 라우팅, 상태관리, 컴포넌트, 데이터 흐름 | 패턴 변경 시 |
| §4 Technical Constraints | 빌드 산출물, 제약사항 | 드물게 |
| §5 Current Status | 현재 단계, 최근 변경, 활성 결정사항 | **매 세션** |
| §6 Implementation Log | 완료 요약, 미래 작업 | 마일스톤 시 |

### 워크플로우 패턴

```bash
# 패턴 1: 빠른 프로토타이핑 (배포 없이)
/session-start 오늘은 새 컴포넌트 구현
→ 작업 수행
/session-end 컴포넌트 구현 완료

# 패턴 2: 배포 포함
/session-end 기능 구현 완료
/deploy

# 패턴 3: 프리뷰 배포
/session-end QA용 변경사항
/deploy --preview
```
