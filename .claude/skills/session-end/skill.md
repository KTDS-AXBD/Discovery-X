---
name: session-end
description: 세션 중 변경사항을 커밋하고 SPEC.md에 반영한다 (배포 제외). 배포는 /deploy 스킬을 별도 호출.
argument-hint: "[추가 메모]"
user-invocable: true
---

# Session End — Git 커밋 + SPEC.md 업데이트

세션 종료 시 코드 변경사항을 커밋하고, SPEC.md를 업데이트한다.
배포는 별도 `/deploy` 스킬로 수행한다.

## Git 변경사항 확인

```bash
!`git log --oneline -10`
```

```bash
!`git diff --stat`
```

## 지시사항

### Phase 1: Git 커밋

1. **변경사항 확인**:
   - `git status`로 staged/unstaged/untracked 파일 확인
   - `git diff`로 변경 내용 확인
   - 변경사항이 없으면 Phase 2로 건너뛰기

2. **코드 변경사항 커밋** (SPEC.md 제외):
   - `SPEC.md`는 이 단계에서 커밋하지 않음 (Phase 2에서 별도 커밋)
   - 세션 중 수행한 작업을 기반으로 커밋 메시지 작성
   - 논리적 단위로 분리 가능하면 여러 커밋으로 나누기 (예: 기능별)
   - 커밋 메시지 컨벤션: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:` 등
   - `.env`, 자격 증명, 민감한 파일은 커밋하지 않음

3. **타입 체크 + 빌드 확인**:
   - `pnpm typecheck` 실행 → 타입 에러 수정
   - `pnpm build` 실행 → 빌드 에러 수정
   - 실패 시 수정 후 재시도

### Phase 2: SPEC.md 업데이트

4. **SPEC.md 읽기**:
   - `SPEC.md` 전체를 읽어 현재 상태 파악

5. **세션 중 변경사항 분석**:
   - git diff/log에서 이번 세션의 변경 파악
   - 대화 내역에서 수행한 작업 정리

6. **SPEC.md 섹션별 업데이트** (해당하는 섹션만):
   - §1 Project Overview — 범위/목표 변경 반영 (드물게)
   - §2 Product Design — UI/워크플로우 변경 반영 (기능 추가 시)
   - §3 Architecture Patterns — 새 패턴 추가/변경 (패턴 변경 시)
   - §4 Technical Constraints — 제약사항 변경 (드물게)
   - §5 Current Status — **항상 업데이트**: 현재 단계, 최근 변경, 활성 결정사항
   - §6 Implementation Log — 완료 요약, 미래 작업 (마일스톤 시)

7. **SPEC.md 변경사항 커밋**:
   - SPEC.md만 별도 커밋
   - 커밋 메시지: `docs: update SPEC.md — [세션 요약]`

8. **인자가 제공된 경우**:
   - `$ARGUMENTS`로 추가 메모가 전달되면 §5 Current Status에 반영

### Phase 3: GitHub Project 동기화 (선택)

9. **동기화 제안** (§6 변경 시에만):
   - Phase 2에서 SPEC.md §6 Implementation Log가 업데이트된 경우에만 실행
   - §6 변경이 없으면 이 Phase를 건너뛴다
   - 사용자에게 제안: "SPEC.md §6이 업데이트되었습니다. GitHub Project와 동기화할까요?"
   - AskUserQuestion으로 선택지 제시:
     - **push** — SPEC.md 기준으로 GitHub Project 동기화 (`/sync push` 실행)
     - **status 확인** — 차이점만 확인 (`/sync status` 실행)
     - **건너뛰기** — 동기화하지 않고 종료
   - 사용자가 push 또는 status를 선택하면 해당 `/sync` 스킬을 실행한다

### 최종 요약 출력

10. **업데이트 요약 출력**:
    - 커밋 내역 (해시 + 메시지)
    - SPEC.md에서 업데이트된 섹션 목록
    - 각 섹션의 주요 변경 내용

## 업데이트 원칙

- 기존 구조와 형식을 유지
- 정보 추가/수정만, 삭제는 신중하게
- §5 Current Status는 매 세션 반드시 업데이트

## 출력 형식

```
## 세션 종료 완료

### Git 커밋
- `abc1234` feat: [커밋 메시지]
- `def5678` docs: update SPEC.md — [요약]
(변경사항이 없으면 "커밋할 변경사항 없음" 표시)

### SPEC.md 업데이트
- §5 Current Status — [변경 요약]
- §6 Implementation Log — [변경 요약] (해당 시)
- ...

### GitHub Project 동기화
- 동기화 완료: N개 push (또는 "§6 변경 없음 — 건너뜀" 또는 "사용자 건너뛰기")

### 다음 단계
- 배포가 필요하면: `/deploy` (프로덕션) 또는 `/deploy --preview` (프리뷰)
- 동기화가 필요하면: `/sync push` 또는 `/sync status`

### 이번 세션 요약
- [수행한 주요 작업]
- [남은 작업/다음 단계]
```
