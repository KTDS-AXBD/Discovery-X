---
name: s-start
description: 세션 시작 시 프로젝트 컨텍스트를 복원한다. MEMORY.md(자동 로딩)로 즉시 맥락 파악 후 SPEC.md를 읽어 프로젝트 사양을 보충한다.
argument-hint: "[오늘 작업할 내용]"
user-invocable: true
---

# Session Start — 3-Tier 컨텍스트 복원

## 아키텍처

```
Tier 1 (자동): CLAUDE.md + MEMORY.md → 이미 컨텍스트에 있음
Tier 2 (Read): SPEC.md (~540줄) → 프로젝트 사양 보충
Tier 3 (검색): docs/CHANGELOG.md → 필요 시에만 grep
```

## Git 상태 확인

```bash
!`git log --oneline -5`
```

```bash
!`git status`
```

## 지시사항

### 1. MEMORY.md 컨텍스트 확인 (이미 로딩됨)

MEMORY.md는 시스템 프롬프트에 자동 로딩되어 있다. 다음을 즉시 파악:
- **현재 작업 컨텍스트**: 버전, 마지막 세션, 다음 작업
- **최근 세션 요약**: 최근 5개 세션 1줄 요약
- **활성 결정사항**: 인증, 스택, 배포, 운영 상태

### 2. SPEC.md 읽기 (프로젝트 사양 보충)

SPEC.md를 읽되, 이미 MEMORY.md에서 파악한 정보는 건너뛴다:
- §1-4: 프로젝트 배경/설계/아키텍처/제약 (변경이 드묾, 빠르게 스캔)
- §5: 버전 + 지표 숫자 확인 (세션 히스토리는 CHANGELOG.md에 있음)
- §6: 구현 현황 및 미래 작업

### 3. 과거 세션 상세 필요 시 (선택적)

특정 세션의 상세가 필요하면 docs/CHANGELOG.md에서 검색:
```bash
grep -n '세션 NNN' docs/CHANGELOG.md
```

### 4. 프로젝트 상태 요약 출력

### 5. 인자가 제공된 경우

`$ARGUMENTS`로 오늘 작업할 내용이 전달되면:
- 해당 작업과 관련된 SPEC.md 섹션 강조
- 관련 파일, 패턴, 주의사항 제시
- MEMORY.md의 "다음 작업" 확인하여 연속성 체크

## 출력 형식

```
## 프로젝트 상태 요약

**현재 버전**: [MEMORY.md에서]
**빌드/테스트**: [SPEC.md §5 지표]
**최근 세션**: [MEMORY.md 최근 요약]

### 오늘 작업 관련 컨텍스트
[인자가 있으면 관련 정보 출력]

### 참고
[주의사항, 관련 패턴 등]
```
