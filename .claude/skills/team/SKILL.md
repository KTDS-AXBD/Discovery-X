---
name: team
description: Agent Teams를 생성하여 작업을 병렬 수행한다. tmux split pane 모드.
argument-hint: "<작업 설명>"
user-invocable: true
---

# Team — Agent Teams 병렬 작업 실행

`$ARGUMENTS`로 전달된 작업을 분석하여 Agent Team을 구성하고, 팀원들이 병렬로 작업을 수행한다.

## Arguments

`$ARGUMENTS`에 수행할 작업을 자연어로 기술한다. 예시:
- `/team lint 에러 전체 수정`
- `/team Venture 모듈 테스트 커버리지 80% 달성`
- `/team 다크모드 컬러 토큰 리팩토링`

## Steps

### 1. 작업 분석 및 팀 구성 결정

`$ARGUMENTS`의 작업 설명을 분석하여 다음을 결정한다:

- **팀 이름**: 작업 키워드 기반 kebab-case (예: `fix-lint-errors`, `venture-test-coverage`)
- **팀원 수**: 2~5명 (작업 복잡도에 따라)
  - 단순 반복 작업 (lint 수정 등): 파일/모듈 수에 비례하여 2~4명
  - 기능 구현: 레이어/모듈별 분할하여 2~3명
  - 대규모 리팩토링: 영역별 분할하여 3~5명
- **역할 분배**: 팀원끼리 **같은 파일을 동시 수정하지 않도록** 파일/모듈/레이어 기준으로 분할
- **mode 결정**: 변경 예상 파일이 5개 이상이면 `plan`, 아니면 `bypassPermissions`

작업 분석 시 코드베이스를 탐색하여 실제 대상 파일과 범위를 파악한다.

### 2. 팀 생성

`TeamCreate` 도구로 팀을 생성한다:
- `team_name`: Step 1에서 결정한 팀 이름
- `description`: 작업 설명

### 3. 태스크 생성

작업을 독립적인 태스크로 분할하여 `TaskCreate`로 생성한다:

- 각 태스크는 담당 파일 목록과 구체적 수정 내용을 포함
- 태스크 간 의존성이 있으면 `TaskUpdate`로 `addBlockedBy` 설정
- **마지막에 검증 태스크 추가**: lint + test 실행 (모든 구현 태스크에 `addBlockedBy` 설정)

### 4. 팀원 스폰

`Task` 도구로 팀원을 스폰한다. **독립적인 팀원은 병렬로 동시에 스폰한다.**

각 팀원 스폰 시 파라미터:
- `subagent_type`: `general-purpose`
- `model`: `opus`
- `mode`: Step 1에서 결정한 mode (`plan` 또는 `bypassPermissions`)
- `run_in_background`: `true`
- `team_name`: Step 2에서 생성한 팀 이름
- `name`: 역할 기반 이름 (예: `worker-1`, `worker-2` 또는 `lint-routes`, `lint-lib` 등)

각 팀원에게 전달할 프롬프트에 반드시 포함:
- 팀 이름과 본인 이름
- 담당 태스크 ID
- **구체적인 파일 경로와 수정 내용**
- 프로젝트 규칙 (CLAUDE.md의 관련 섹션)
- "작업 완료 후 TaskUpdate로 태스크를 completed로 변경하라"는 지시
- "모든 태스크 완료 후 TaskList를 확인하여 추가 가용 태스크가 있으면 claim하라"는 지시

### 5. 모니터링

팀원들의 완료 메시지를 수신 대기한다:
- 팀원 idle 알림은 정상적인 동작이므로 별도 대응 불필요
- 팀원이 문제를 보고하면 지시 또는 태스크 재분배
- `TaskList`로 전체 진행 상황을 주기적으로 확인
- 모든 구현 태스크가 `completed` 상태가 되면 Step 6으로 이동

### 6. 검증

검증 태스크를 직접 실행한다 (팀원 위임 아님):

```bash
pnpm lint
```
- 0 errors 확인. 에러 있으면 직접 수정.

```bash
pnpm typecheck
```
- 타입 에러 확인. 에러 있으면 직접 수정.

```bash
pnpm test
```
- 전체 테스트 통과 확인. 환경 이슈로 실패 시 사용자에게 보고.

검증 실패 시 해당 팀원에게 수정 요청하거나 직접 수정한다.

### 7. 정리 및 결과 출력

1. 각 팀원에게 `SendMessage`로 `shutdown_request` 전송
2. 모든 팀원 종료 확인 후 `TeamDelete`로 팀 삭제
3. 검증 태스크를 `completed`로 업데이트
4. 결과 요약 출력

## 출력 형식

```
## Team 작업 완료

**팀**: [팀 이름] ([N]명)
**작업**: [작업 설명]

### 수행 결과
| 팀원 | 태스크 | 상태 | 변경 파일 |
|------|--------|------|----------|
| worker-1 | [태스크 설명] | completed | [N]개 |
| worker-2 | [태스크 설명] | completed | [N]개 |

### 검증
- ESLint: PASS (0 errors)
- TypeScript: PASS (0 errors)
- Tests: PASS ([N]/[N])

### 변경 요약
- 총 [N]개 파일 변경
- [주요 변경 내용 요약]
```

## 주의사항

- 팀원끼리 같은 파일을 동시 수정하지 않도록 태스크를 분할한다
- 팀원에게 충분한 컨텍스트를 제공한다 (파일 경로, 수정 내용, 프로젝트 규칙)
- 검증은 리드(본인)가 직접 수행한다
- `$ARGUMENTS`가 비어있으면 사용자에게 작업 설명을 요청한다
