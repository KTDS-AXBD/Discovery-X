---
name: team
description: Agent Teams를 tmux split pane에서 병렬 수행한다. 각 worker가 별도 pane에서 실시간 가시적으로 작업.
argument-hint: "<작업 설명>"
user-invocable: true
---

# Team — tmux Split Pane Agent Teams

`$ARGUMENTS`로 전달된 작업을 분석하여, tmux split pane에서 병렬 `claude -p` 인스턴스를 실행한다.
각 worker의 작업 과정을 실시간으로 확인할 수 있다.

## CRITICAL: WSL 환경 규칙

이 프로젝트는 **Windows + WSL** 환경이다. Claude Code의 Bash는 **Git Bash (Windows)**에서 실행되므로:

1. **tmux 명령은 반드시 `wsl -e` 접두사**로 실행한다:
   - `wsl -e tmux new-session ...` (O)
   - `tmux new-session ...` (X — "command not found")
2. **임시 파일은 프로젝트 내 `.team-tmp/`** 디렉토리에 저장한다:
   - `.team-tmp/` (O — Git Bash와 WSL 모두 접근 가능)
   - `/tmp/` (X — Git Bash와 WSL의 /tmp/가 다른 위치)
3. **모든 스크립트 내 경로는 WSL 형식** (`/mnt/d/...`)을 사용한다
4. **launcher 스크립트 실행**: `wsl -e bash -c "bash /mnt/d/.../launcher.sh"` 형식 사용
   - `wsl bash /mnt/d/...` (X — Git Bash가 경로를 맹글링함)
5. **claude 경로**: WSL 내에서는 `/home/sinclair/.local/bin/claude` 사용

## Arguments

`$ARGUMENTS`에 수행할 작업을 자연어로 기술한다. 예시:
- `/team lint 에러 전체 수정`
- `/team Venture 모듈 테스트 커버리지 80% 달성`
- `/team 다크모드 컬러 토큰 리팩토링`

## Steps

### 1. 작업 분석 및 팀 구성 결정

`$ARGUMENTS`의 작업 설명을 분석하여 다음을 결정한다:

- **팀 이름**: 작업 키워드 기반 kebab-case (예: `fix-lint-errors`, `venture-test-coverage`)
- **worker 수**: 2~4명 (작업 복잡도에 따라, tmux 가시성을 위해 최대 4명 권장)
  - 단순 반복 작업 (lint 수정 등): 파일/모듈 수에 비례하여 2~3명
  - 기능 구현: 레이어/모듈별 분할하여 2~3명
  - 대규모 리팩토링: 영역별 분할하여 3~4명
- **역할 분배**: worker끼리 **같은 파일을 동시 수정하지 않도록** 파일/모듈/레이어 기준으로 분할
- **allowedTools 결정**: 태스크에 필요한 도구 목록 결정
  - 읽기만: `Read,Glob,Grep`
  - 수정 포함: `Read,Edit,Write,Glob,Grep,Bash`

작업 분석 시 코드베이스를 탐색하여 실제 대상 파일과 범위를 파악한다.

### 2. Worker 프롬프트 작성

각 worker에게 전달할 프롬프트를 작성한다. 프롬프트에 반드시 포함:

- **구체적인 파일 경로와 수정 내용** (가장 중요)
- 작업 범위 제한 (어떤 파일/디렉토리만 수정할 것인지)
- 프로젝트 규칙 (CLAUDE.md의 관련 섹션, 간략히)
- 작업 완료 기준

먼저 임시 디렉토리를 생성하고, 프롬프트를 **임시 파일**에 저장한다:

```bash
mkdir -p /d/01_Projects/Discovery-X/.team-tmp
```

```bash
cat > /d/01_Projects/Discovery-X/.team-tmp/team-{팀이름}-worker-{N}.txt << 'PROMPT'
[worker 프롬프트 내용]
PROMPT
```

### 3. Launcher 스크립트 생성 및 실행 (tmux 세션 + pane + worker 스폰)

> **CRITICAL**: 이 단계는 반드시 **단일 launcher 스크립트**로 실행해야 한다.
> tmux 세션 생성, pane 분할, worker 실행을 개별 Bash 호출로 분리하면 안 된다.
> 백그라운드 프로세스로 대체하는 것도 금지한다 — 반드시 tmux pane으로 실행한다.

**3a. worker runner 스크립트**를 생성한다 (worker 수만큼 반복).
스크립트 내의 모든 경로는 **WSL 형식** (`/mnt/d/...`)을 사용한다:

```bash
TEAM_DIR="/d/01_Projects/Discovery-X/.team-tmp"
WSL_TEAM_DIR="/mnt/d/01_Projects/Discovery-X/.team-tmp"

cat > $TEAM_DIR/team-{팀이름}-run-{N}.sh << 'RUNNER'
#!/usr/bin/env bash
export PATH="/home/sinclair/.local/bin:$PATH"
cd /mnt/d/01_Projects/Discovery-X
prompt=$(cat /mnt/d/01_Projects/Discovery-X/.team-tmp/team-{팀이름}-worker-{N}.txt)
claude -p "$prompt" \
  --allowedTools 'Read,Edit,Write,Glob,Grep,Bash' \
  --max-turns 20 \
  --verbose 2>&1 | tee /mnt/d/01_Projects/Discovery-X/.team-tmp/team-{팀이름}-worker-{N}.log
echo '=== WORKER-{N} DONE ===' >> /mnt/d/01_Projects/Discovery-X/.team-tmp/team-{팀이름}-worker-{N}.log
RUNNER
chmod +x $TEAM_DIR/team-{팀이름}-run-{N}.sh
```

> **주의**: runner 스크립트의 heredoc은 `'RUNNER'` (따옴표 있음)으로, 변수 확장 없이 그대로 저장된다.

**3b. launcher 스크립트를 생성**한다. worker 수(N)에 맞게 아래 템플릿을 사용:

```bash
cat > $TEAM_DIR/team-{팀이름}-launcher.sh << 'LAUNCHER'
#!/usr/bin/env bash
set -e
TEAM="{팀이름}"
PROJECT_DIR="/mnt/d/01_Projects/Discovery-X"
TEAM_DIR="/mnt/d/01_Projects/Discovery-X/.team-tmp"

# 1) tmux 세션 생성 (detached)
tmux kill-session -t "$TEAM" 2>/dev/null || true
tmux new-session -d -s "$TEAM" -n workers -c "$PROJECT_DIR"

# 2) Worker 1 — 기본 pane에서 실행
tmux send-keys -t "$TEAM:workers" "bash $TEAM_DIR/team-${TEAM}-run-1.sh" Enter

# 3) Worker 2 — 수직 분할
tmux split-window -t "$TEAM:workers" -h -c "$PROJECT_DIR"
tmux send-keys -t "$TEAM:workers" "bash $TEAM_DIR/team-${TEAM}-run-2.sh" Enter

# 4) Worker 3 (필요 시) — Worker 1 아래 수평 분할
# tmux split-window -t "$TEAM:workers.0" -v -c "$PROJECT_DIR"
# tmux send-keys -t "$TEAM:workers" "bash $TEAM_DIR/team-${TEAM}-run-3.sh" Enter

# 5) Worker 4 (필요 시) — Worker 2 아래 수평 분할
# tmux split-window -t "$TEAM:workers.1" -v -c "$PROJECT_DIR"
# tmux send-keys -t "$TEAM:workers" "bash $TEAM_DIR/team-${TEAM}-run-4.sh" Enter

# 6) 레이아웃 균등 배치
tmux select-layout -t "$TEAM:workers" tiled

echo "tmux session '$TEAM' created with split panes"
tmux list-panes -t "$TEAM:workers"
LAUNCHER
chmod +x $TEAM_DIR/team-{팀이름}-launcher.sh
```

> **worker 수에 따라 주석(#)을 해제**하여 3명, 4명 구성을 만든다.

**3c. launcher를 WSL을 통해 실행**한다:
```bash
wsl -e bash -c "bash /mnt/d/01_Projects/Discovery-X/.team-tmp/team-{팀이름}-launcher.sh"
```

**3d. pane 생성을 검증**한다:
```bash
wsl -e tmux list-panes -t {팀이름}:workers
```
- pane 수가 worker 수와 일치하는지 확인한다
- 불일치하면 launcher 스크립트를 다시 실행한다

사용자에게 안내한다:
```
tmux 세션 확인: tmux attach -t {팀이름}
pane 이동: Ctrl+b 방향키 | 확대: Ctrl+b z | detach: Ctrl+b d
```

**pane 레이아웃 (4명일 때)**:
```
+------------------+------------------+
|  Worker 1        |  Worker 2        |
|  (routes/)       |  (lib/)          |
+------------------+------------------+
|  Worker 3        |  Worker 4        |
|  (components/)   |  (features/)     |
+------------------+------------------+
```

### 4. 모니터링

Worker들의 완료를 대기한다. 로그 파일 기반으로 진행 상황을 확인:

```bash
wsl -e bash -c 'TEAM_DIR="/mnt/d/01_Projects/Discovery-X/.team-tmp"; for i in 1 2; do if grep -q "WORKER-${i} DONE" "$TEAM_DIR/team-{팀이름}-worker-${i}.log" 2>/dev/null; then echo "Worker ${i}: DONE"; else echo "Worker ${i}: RUNNING"; fi; done'
```

tmux pane 내용을 직접 확인하려면:
```bash
wsl -e tmux capture-pane -t {팀이름}:workers.1 -p
wsl -e tmux capture-pane -t {팀이름}:workers.2 -p
```

**모니터링 규칙:**
- 30초 간격으로 로그 파일의 DONE 마커를 확인한다
- 모든 worker 로그에 `DONE` 마커가 확인되면 Step 6으로 이동
- 5분 이상 응답 없는 worker는 사용자에게 보고한다

### 5. 검증

모든 worker 완료 후, 리더가 직접 검증한다:

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

검증 실패 시 직접 수정하거나, 해당 영역에 대해 새 worker를 스폰한다.

### 6. 정리 및 결과 출력

1. tmux 세션 종료:
```bash
wsl -e tmux kill-session -t {팀이름} 2>/dev/null
```

2. 로그 파일에서 결과 수집 (tmux pane 캡처):
```bash
wsl -e tmux capture-pane -t {팀이름}:workers.1 -p
wsl -e tmux capture-pane -t {팀이름}:workers.2 -p
```

3. 임시 파일 정리:
```bash
rm -rf /d/01_Projects/Discovery-X/.team-tmp
```

4. 결과 요약 출력

## 출력 형식

```
## Team 작업 완료 (tmux mode)

**팀**: {팀이름} ([N]명)
**작업**: [작업 설명]

### 수행 결과
| Worker | Pane | 태스크 | 상태 | 변경 파일 |
|--------|------|--------|------|----------|
| worker-1 | 0 | [태스크 설명] | DONE | [N]개 |
| worker-2 | 1 | [태스크 설명] | DONE | [N]개 |

### 검증
- ESLint: PASS (0 errors)
- TypeScript: PASS (0 errors)
- Tests: PASS ([N]/[N])

### 변경 요약
- 총 [N]개 파일 변경
- [주요 변경 내용 요약]
```

## 주의사항

### CRITICAL — tmux pane 필수 사용
- **절대 금지**: `claude -p`를 백그라운드 프로세스(`&`, `nohup`)로 실행하고 로그 파일만 polling하는 방식
- **반드시 tmux split pane에서 실행**: Step 3의 launcher 스크립트를 통해 tmux 세션/pane을 생성해야 한다
- pane 생성 후 `tmux list-panes`로 검증해야 한다 — 실패하면 재시도

### 일반 규칙
- worker끼리 **같은 파일을 동시 수정하지 않도록** 태스크를 분할한다
- `--allowedTools` 미지정 시 승인 프롬프트가 떠서 pane이 멈춤 — 반드시 지정
- `--max-turns`로 무한 루프 방지 (기본 20, 복잡한 작업은 30까지)
- worker 프롬프트는 `/tmp/` 임시 파일 + **runner 스크립트**로 전달 (send-keys 내 `$(cat ...)` 확장 금지)
- runner 스크립트에서 `claude` PATH를 명시적으로 설정하여 tmux pane 환경 차이를 해소
- git 작업(commit, push)은 worker에게 시키지 않는다 — 리더만 수행
- tmux pane 최대 4개 권장 (그 이상은 가시성 저하)
- `$ARGUMENTS`가 비어있으면 사용자에게 작업 설명을 요청한다

## tmux 기본 조작법

```
Ctrl+b "         수평 분할
Ctrl+b %         수직 분할
Ctrl+b 방향키    pane 이동
Ctrl+b z         pane 확대/축소 (토글)
Ctrl+b [         스크롤 모드 (q로 나가기)
Ctrl+b d         세션 detach (백그라운드 유지)
tmux a -t 이름   세션 다시 attach
```
