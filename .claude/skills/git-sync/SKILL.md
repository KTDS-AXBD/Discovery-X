---
name: git-sync
description: "Git을 통한 멀티 환경(Windows/WSL) 간 프로젝트 동기화. 로컬과 GitHub 리모트 상태를 비교하고 push/pull로 동기화한다. 환경 전환 전후 사용. Use when user mentions: git sync, 환경 동기화, WSL 동기화, push, pull, 코드 동기화, 환경 전환, git-sync."
argument-hint: "[push|pull|status|stash]"
user-invocable: true
---

# Git Sync — 멀티 환경 프로젝트 동기화

Windows ↔ WSL 등 여러 환경에서 GitHub을 허브로 사용하여 프로젝트를 동기화한다.

## 서브커맨드 분기

- `$ARGUMENTS` 비어 있거나 `status` → **Status 플로우**
- `push` → **Push 플로우** (환경 떠나기 전)
- `pull` → **Pull 플로우** (환경 진입 후)
- `stash` → **Stash 상태 확인**
- 그 외 → "사용법: `/git-sync [push|pull|status|stash]`" 출력 후 종료

---

## 공통 로직 (모든 플로우에서 먼저 실행)

### Step 1: 로컬 상태 수집

```bash
git status --short
git stash list
git log --oneline -5
```

### Step 2: 리모트 최신 정보 가져오기

```bash
git fetch origin
```

### Step 3: 로컬 ↔ 리모트 비교

```bash
# 현재 브랜치
git branch --show-current

# ahead/behind 카운트
git rev-list --left-right --count HEAD...origin/<현재브랜치>
```

결과를 파싱하여 `LOCAL_AHEAD`, `REMOTE_AHEAD` 값 확보.

### Step 4: 상태 분류

| 조건 | 상태 |
|------|------|
| LOCAL_AHEAD=0, REMOTE_AHEAD=0 | `synced` (동기화 완료) |
| LOCAL_AHEAD>0, REMOTE_AHEAD=0 | `ahead` (로컬이 앞섬 → push 필요) |
| LOCAL_AHEAD=0, REMOTE_AHEAD>0 | `behind` (리모트가 앞섬 → pull 필요) |
| LOCAL_AHEAD>0, REMOTE_AHEAD>0 | `diverged` (분기됨 → 주의 필요) |

---

## Status 플로우 (`/git-sync` 또는 `/git-sync status`)

공통 로직 실행 후 결과를 출력:

```
## 프로젝트 동기화 상태

**브랜치**: master
**리모트**: origin (https://github.com/...)

### 커밋 비교
| 방향 | 커밋 수 | 상태 |
|------|---------|------|
| 로컬 → 리모트 | N개 ahead | push 필요 / 동기화됨 |
| 리모트 → 로컬 | N개 behind | pull 필요 / 동기화됨 |

### 로컬 변경사항
- 수정: N개 파일
- 미추적: N개 파일
- Stash: N개

### 최근 로컬 커밋
- abc1234 feat: ...
- def5678 fix: ...

### 최근 리모트 커밋 (로컬에 없는 것)
- (없음 / 커밋 목록)

### 권장 액션
- (상태에 따른 다음 액션 제안)
```

`diverged` 상태인 경우 **경고**를 표시하고, rebase/merge 중 택일을 AskUserQuestion으로 확인.

---

## Push 플로우 (`/git-sync push`)

환경을 떠나기 전에 실행. 로컬 변경사항을 리모트에 반영한다.

### Step 1: 로컬 변경사항 확인

`git status --short` 결과 확인.

- 변경사항 없고 ahead=0 → "이미 동기화되어 있습니다" 출력 후 종료
- 변경사항 없고 ahead>0 → Step 4로 건너뛰기 (push만)

### Step 2: 커밋 생성

변경사항이 있으면:

1. `git diff --stat`으로 변경 내용 요약 표시
2. AskUserQuestion으로 사용자에게 확인:
   - **WIP 커밋** — `chore: WIP sync from <환경명>` 메시지로 빠른 커밋
   - **정식 커밋** — 사용자에게 커밋 메시지 입력 요청
   - **선택적 커밋** — 파일별로 선택하여 커밋
   - **취소** — 커밋하지 않음

환경명 감지:
```bash
# WSL 여부 확인
if grep -qi microsoft /proc/version 2>/dev/null; then
  ENV_NAME="WSL"
elif [[ "$OS" == "Windows_NT" ]]; then
  ENV_NAME="Windows"
else
  ENV_NAME="$(uname -s)"
fi
```

### Step 3: 검증 (정식 커밋 선택 시)

```bash
pnpm typecheck && pnpm lint
```

- WIP 커밋 선택 시 검증 건너뛰기 (빠른 동기화 목적)
- 실패 시 사용자에게 보고하고 계속할지 확인

### Step 4: Push

```bash
git push origin <현재브랜치>
```

- 실패 시 (리모트가 앞선 경우): "먼저 `/git-sync pull` 실행 필요" 안내
- `diverged` 상태이면 push 전에 pull/rebase 선행 필요함을 안내

### Step 5: 결과 출력

```
## Push 완료

- 커밋: `abc1234` chore: WIP sync from Windows
- Push: N개 커밋 → origin/master
- 상태: 동기화 완료

### 다른 환경에서
> `/git-sync pull` 실행하여 동기화
```

---

## Pull 플로우 (`/git-sync pull`)

다른 환경에서 진입 후 실행. 리모트 변경사항을 로컬에 반영한다.

### Step 1: 로컬 변경사항 확인

`git status --short` 결과 확인.

- behind=0 → "이미 최신입니다" 출력 후 종료

### Step 2: 미커밋 변경사항 처리

로컬에 미커밋 변경사항이 있으면:

1. AskUserQuestion으로 사용자에게 확인:
   - **Stash 후 Pull** — `git stash push -m "git-sync: auto-stash before pull"` 후 진행
   - **WIP 커밋 후 Pull** — 변경사항을 WIP 커밋 후 진행
   - **취소** — pull 중단

### Step 3: Pull

```bash
git pull --rebase origin <현재브랜치>
```

- `--rebase` 기본 사용 (히스토리 깔끔하게 유지)
- 충돌 발생 시:
  1. 충돌 파일 목록 표시
  2. 각 파일의 충돌 내용을 보여주고 해결 지원
  3. 해결 후 `git rebase --continue`

### Step 4: Stash 복원

Step 2에서 stash 했으면:

```bash
git stash pop
```

- 충돌 시 사용자에게 보고하고 수동 해결 안내

### Step 5: WIP 커밋 정리 제안

Pull 후 로그에 WIP 커밋이 보이면:

```bash
git log --oneline -10 --grep="WIP sync"
```

WIP 커밋이 있으면 사용자에게 안내:
- "이전 환경에서 WIP 커밋이 있습니다. 작업 계속 후 `/session-end`로 정식 커밋하세요."

### Step 6: 결과 출력

```
## Pull 완료

- Pull: N개 커밋 ← origin/master
- 최신 커밋: `abc1234` chore: WIP sync from WSL
- Stash: 복원됨 / 해당 없음
- 상태: 동기화 완료

### WIP 커밋 감지
- `abc1234` chore: WIP sync from WSL
→ 작업 계속 후 `/session-end`로 정식 커밋 권장
```

---

## Stash 플로우 (`/git-sync stash`)

```bash
git stash list
```

- stash가 없으면 "stash 없음" 출력
- stash가 있으면 목록 표시 + "pop/drop/show" 선택지 제공

---

## 엣지 케이스

- **diverged 상태**: push 전에 반드시 pull --rebase 선행. force push 절대 금지.
- **SPEC.md 충돌**: SPEC.md는 양쪽에서 수정 가능성 높음. 충돌 시 양쪽 내용을 모두 보여주고 사용자 결정.
- **WIP 커밋 누적**: 3개 이상 WIP 커밋이 쌓이면 squash 제안 (사용자 확인 후).
- **리모트 브랜치 없음**: 첫 push 시 `git push -u origin <브랜치>` 사용.
- **.dev.vars 등 민감 파일**: 절대 커밋하지 않음. `git status`에 보이면 경고.
