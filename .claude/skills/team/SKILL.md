---
name: team
description: Agent Teams를 tmux in-window split에서 병렬 수행한다. 리더 pane 옆에 worker pane이 직접 보이는 방식.
argument-hint: "<작업 설명>"
user-invocable: true
---

# Team — tmux In-Window Split Agent Teams

`$ARGUMENTS`로 전달된 작업을 분석하여, **리더와 같은 tmux window 내**에서 병렬 `claude -p` 인스턴스를 실행한다.
Worker pane은 리더 pane 옆에 직접 보이며, 완료 후 원래 레이아웃으로 자동 복원된다.

**리더 pane은 크기/위치/프로세스 모두 변경하지 않는다.**

## 환경 규칙

이 프로젝트는 **Windows + WSL** 환경이다. Claude Code 실행 위치에 따라 명령이 달라진다.

### 환경 자동 감지 (Step 0에서 수행)

Step 시작 전, 아래 명령으로 환경을 판별한다:
```bash
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo "WSL_DIRECT"   # WSL 내부에서 직접 실행 — tmux 바로 호출
else
  echo "GIT_BASH"     # Git Bash — wsl -e 접두사 필요
fi
```

### WSL 직접 실행 (WSL_DIRECT)
- tmux 명령을 **직접** 호출: `tmux new-session ...`
- 경로: `$PWD` 기반 (예: `/home/sinclair/projects/Discovery-X`)
- claude 경로: `/home/sinclair/.local/bin/claude`

### Git Bash 실행 (GIT_BASH)
- tmux 명령에 **`wsl -e` 접두사** 필수: `wsl -e tmux new-session ...`
- launcher 실행: `wsl -e bash -c "bash /mnt/d/.../launcher.sh"`
  - `wsl bash /mnt/d/...` (X — Git Bash가 경로를 맹글링함)
- 스크립트 내 경로는 **WSL 형식** (`/mnt/d/...`) 사용

### 공통 규칙
1. **임시 파일은 프로젝트 내 `.team-tmp/`** 디렉토리에 저장
2. **claude 호출**: runner 스크립트에서 반드시 `command claude`로 호출 (`.bashrc` alias 우회 필수)
3. **`CLAUDE_CONFIG_DIR` 전파**: 현재 세션의 `CLAUDE_CONFIG_DIR` 값을 runner 스크립트에 export (인증 컨텍스트 유지)

## Arguments

`$ARGUMENTS`에 수행할 작업을 자연어로 기술한다. 예시:
- `/team lint 에러 전체 수정`
- `/team Venture 모듈 테스트 커버리지 80% 달성`
- `/team 다크모드 컬러 토큰 리팩토링`

## Steps

### 1. 작업 분석 및 팀 구성 결정

`$ARGUMENTS`의 작업 설명을 분석하여 다음을 결정한다:

- **팀 이름**: 작업 키워드 기반 kebab-case (예: `fix-lint-errors`, `venture-test-coverage`)
- **worker 수**: 2~3명 (작업 복잡도에 따라. 같은 column 내 분할이므로 **최대 3명** 권장)
  - 단순 반복 작업 (lint 수정 등): 파일/모듈 수에 비례하여 2~3명
  - 기능 구현: 레이어/모듈별 분할하여 2~3명
  - 대규모 리팩토링: 영역별 분할하여 2~3명
- **역할 분배**: worker끼리 **같은 파일을 동시 수정하지 않도록** 파일/모듈/레이어 기준으로 분할
- **태스크 요약**: 각 worker의 작업을 **10자 내외 한줄**로 요약 (pane 타이틀에 표시됨)
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
TEAM_DIR="$PWD/.team-tmp"
mkdir -p "$TEAM_DIR"
```

```bash
cat > "$TEAM_DIR/team-{팀이름}-worker-{N}.txt" << 'PROMPT'
[worker 프롬프트 내용]
PROMPT
```

### 3. Worker 생성 (tmux in-window split)

> **CRITICAL**: worker는 리더와 **같은 window** 내에서 실행된다.
> 리더 pane 자체를 **가로 분할(`-h`)**하여 오른쪽에 worker 전용 컬럼을 생성한다.
> 리더는 넓이가 줄어들지만, **worker 종료 시 자동 복원**된다.
> Worker 컬럼 내에서 worker 수만큼 **세로 분할(`-v`)**하여 각 worker에게 할당한다.
> **리더 외 다른 pane의 크기/위치/프로세스는 절대 변경하지 않는다.**
> 복수 리더가 각각 `/team`을 실행해도 **서로의 영역에 간섭하지 않는다**.
> **break-pane, swap-pane, select-window 사용 금지** — 윈도우 상태 불안정의 원인.

**3a. pane 구조 감지 및 최소 넓이 확인**:

```bash
LEADER_PANE=$(tmux display-message -p '#{pane_id}')
LEADER_WIDTH=$(tmux display-message -p '#{pane_width}')

echo "=== Current Pane Layout ==="
tmux list-panes -F "pane=#{pane_id} left=#{pane_left} top=#{pane_top} size=#{pane_width}x#{pane_height}"
echo "Leader: $LEADER_PANE (width=$LEADER_WIDTH)"

# 최소 넓이 확인 (분할 후 leader/worker 각각 최소 40 컬럼 유지)
if [ "$LEADER_WIDTH" -lt 80 ]; then
  echo "ERROR: Leader pane too narrow ($LEADER_WIDTH cols). Minimum 80 required for split."
  echo "Tip: Expand the terminal or close unused panes."
  exit 1
fi
```

**3b. worker runner 스크립트**를 생성한다 (worker 수만큼 반복).
`PROJECT_DIR`은 `$PWD`로 결정한다 (WSL 내부: `/home/.../Discovery-X`):

```bash
PROJECT_DIR="$PWD"
TEAM_DIR="$PWD/.team-tmp"
CLAUDE_CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

cat > "$TEAM_DIR/team-{팀이름}-run-{N}.sh" << RUNNER
#!/usr/bin/env bash
export PATH="/home/sinclair/.local/bin:\$PATH"
export CLAUDE_CONFIG_DIR="$CLAUDE_CFG"
cd $PROJECT_DIR

# --- pane 타이틀: 작업 중 표시 ---
TASK_SUMMARY="{태스크요약}"
tmux select-pane -t "\$TMUX_PANE" -T "W{N}: \$TASK_SUMMARY ⏳" 2>/dev/null

# --- 시작 배너 ---
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Worker {N} — \$TASK_SUMMARY"
echo "║  시작: \$(date '+%H:%M:%S')"
echo "╚══════════════════════════════════════════╝"
echo ""

prompt=\$(cat "$TEAM_DIR/team-{팀이름}-worker-{N}.txt")
command claude -p "\$prompt" \\
  --allowedTools 'Read,Edit,Write,Glob,Grep,Bash' \\
  --max-turns 20 \\
  --verbose 2>&1 | tee "$TEAM_DIR/team-{팀이름}-worker-{N}.log"

# --- 종료 배너 + pane 타이틀 완료 표시 ---
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  Worker {N} — 완료 ✅"
echo "║  종료: \$(date '+%H:%M:%S')"
echo "╚══════════════════════════════════════════╝"
echo '=== WORKER-{N} DONE ===' >> "$TEAM_DIR/team-{팀이름}-worker-{N}.log"
tmux select-pane -t "\$TMUX_PANE" -T "W{N}: \$TASK_SUMMARY ✅" 2>/dev/null
RUNNER
chmod +x "$TEAM_DIR/team-{팀이름}-run-{N}.sh"
```

> **주의**: heredoc에서 `$PROJECT_DIR`, `$TEAM_DIR`, `$CLAUDE_CFG`는 **생성 시점에 확장**시킨다 (경로를 하드코딩).
> `\$PATH`, `\$prompt`, `\$TMUX_PANE`, `\$TASK_SUMMARY` 등 runner 실행 시점 변수는 이스케이프한다.
> **`command claude`**: `.bashrc`의 `alias claude=...`를 우회하여 실제 바이너리를 호출한다.
> **`CLAUDE_CONFIG_DIR`**: 리더 세션의 인증 컨텍스트(personal/work)를 worker에 전파한다.
> **`$TMUX_PANE`**: tmux가 각 pane에 자동 설정하는 환경변수. runner가 자기 pane 타이틀을 직접 업데이트한다.
> **`{태스크요약}`**: Step 1에서 결정한 각 worker의 10자 내외 태스크 요약을 삽입한다.

**3c. launcher 스크립트를 생성**한다:

> **핵심**: 리더 pane을 `split-window -h` (horizontal)로 분할하여 **오른쪽에 worker 컬럼**을 생성한다.
> Worker 컬럼은 리더의 현재 넓이의 **50%**를 차지한다.
> 각 worker는 worker 컬럼을 **세로 분할(`-v`)**하여 생성한다.
> **리더 외 다른 pane에는 일절 개입하지 않는다** — 복수 리더도 안전.
> **shell init delay**: pane 생성 후 **2초 대기** 필수 (1초로는 부족).

```bash
cat > "$TEAM_DIR/team-{팀이름}-launcher.sh" << LAUNCHER
#!/usr/bin/env bash
set -e
TEAM="{팀이름}"
TEAM_DIR="$TEAM_DIR"
LEADER_PANE="$LEADER_PANE"
PROJECT_DIR="$PROJECT_DIR"
WORKER_COUNT={N}

# 0) 기존 worker pane 정리 (재실행 시)
if [ -f "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt" ]; then
  while read -r old_pane; do
    tmux kill-pane -t "\$old_pane" 2>/dev/null || true
  done < "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  rm -f "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
fi

# 1) Worker 컬럼 생성 — 리더 pane을 가로 분할, 오른쪽 50%를 worker에 할당
WORKER_COL=\$(tmux split-window -h -d -t "\$LEADER_PANE" -l 50% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
echo "\$WORKER_COL" > "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
sleep 2

# 2) Worker 컬럼을 worker 수에 따라 세로 분할 + 실행
if [ "\$WORKER_COUNT" -eq 1 ]; then
  tmux send-keys -t "\$WORKER_COL" "bash \$TEAM_DIR/team-\${TEAM}-run-1.sh" Enter

elif [ "\$WORKER_COUNT" -eq 2 ]; then
  W2=\$(tmux split-window -v -d -t "\$WORKER_COL" -l 50% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
  echo "\$W2" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  sleep 2
  tmux send-keys -t "\$WORKER_COL" "bash \$TEAM_DIR/team-\${TEAM}-run-1.sh" Enter
  tmux send-keys -t "\$W2" "bash \$TEAM_DIR/team-\${TEAM}-run-2.sh" Enter

elif [ "\$WORKER_COUNT" -eq 3 ]; then
  W2=\$(tmux split-window -v -d -t "\$WORKER_COL" -l 67% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
  echo "\$W2" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  sleep 2
  W3=\$(tmux split-window -v -d -t "\$W2" -l 50% -c "\$PROJECT_DIR" -P -F '#{pane_id}')
  echo "\$W3" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
  sleep 2
  tmux send-keys -t "\$WORKER_COL" "bash \$TEAM_DIR/team-\${TEAM}-run-1.sh" Enter
  tmux send-keys -t "\$W2" "bash \$TEAM_DIR/team-\${TEAM}-run-2.sh" Enter
  tmux send-keys -t "\$W3" "bash \$TEAM_DIR/team-\${TEAM}-run-3.sh" Enter
fi

# 3) Pane 타이틀 표시 활성화 + 리더 pane 타이틀 설정
tmux set-option -w pane-border-status top 2>/dev/null
tmux select-pane -t "\$LEADER_PANE" -T "Leader: \$TEAM" 2>/dev/null

echo "Workers created: WORKER_COUNT=\$WORKER_COUNT (right of leader \$LEADER_PANE)"
tmux list-panes -F "pane=#{pane_id} left=#{pane_left} top=#{pane_top} size=#{pane_width}x#{pane_height}"
LAUNCHER
chmod +x "$TEAM_DIR/team-{팀이름}-launcher.sh"
```

> **레이아웃 결과 — 리더 1개, 2 workers**:
> ```
> ┌──────────┬──────┬──────────────────┐
> │ Leader   │ W1   │ Other CC         │
> │ (넓이    ├──────┤ (변경 없음)       │
> │  50%↓)   │ W2   │                  │
> ├──────────┴──────┴──────────────────┤
> │ Status bar                          │
> └─────────────────────────────────────┘
> ```
>
> **레이아웃 결과 — 복수 리더가 각각 /team 실행**:
> ```
> ┌──────┬─────┬──────┬─────┐
> │ L1   │L1-W1│ L2   │L2-W1│  ← 각 리더가 자기 영역만 분할
> │(50%↓)├─────┤(50%↓)├─────┤
> │      │L1-W2│      │L2-W2│
> ├──────┴─────┴──────┴─────┤
> │ Status bar               │
> └──────────────────────────┘
> ```
>
> Worker pane kill 시 해당 리더 pane이 원래 넓이로 **자동 복원**.
> 다른 리더의 worker에는 영향 없음 (팀 이름으로 파일 격리).

**3d. launcher를 실행**한다:

WSL 직접 실행 환경 (WSL_DIRECT):
```bash
bash "$TEAM_DIR/team-{팀이름}-launcher.sh"
```

Git Bash 환경 (GIT_BASH):
```bash
wsl -e bash -c "bash $WSL_TEAM_DIR/team-{팀이름}-launcher.sh"
```

**3e. worker pane 생성을 검증**한다:
```bash
TEAM_DIR="$PWD/.team-tmp"
echo "=== Worker Panes ==="
cat "$TEAM_DIR/team-{팀이름}-worker-panes.txt"
echo ""
echo "=== All Panes ==="
tmux list-panes -F "pane=#{pane_id} left=#{pane_left} top=#{pane_top} size=#{pane_width}x#{pane_height} cmd=#{pane_current_command}"
```
- worker pane 수가 예상과 일치하는지 확인한다
- 불일치하면 launcher 스크립트를 다시 실행한다

**3f.** 사용자에게 안내한다:
```
Team '{팀이름}' 시작 — worker {N}명
리더 pane 오른쪽에 Worker pane이 보입니다.
작업 완료 후 원래 레이아웃으로 자동 복원됩니다.
```

> **NOTE**: window 전환이 불필요하다 — worker는 같은 window에 있으므로 즉시 보인다.

### 4. 모니터링

리더는 로그 파일의 DONE 마커를 확인하여 완료를 감지한다:

```bash
TEAM_DIR="$PWD/.team-tmp"
ALL_DONE=true
for i in 1 2; do
  if grep -q "WORKER-${i} DONE" "$TEAM_DIR/team-{팀이름}-worker-${i}.log" 2>/dev/null; then
    echo "Worker ${i}: DONE"
  else
    echo "Worker ${i}: RUNNING"
    ALL_DONE=false
  fi
done
echo "ALL_DONE=$ALL_DONE"
```

**모니터링 규칙:**
- 사용자는 같은 window에서 worker pane의 실제 출력을 직접 본다
- 리더는 30초 간격으로 DONE 마커만 확인한다 (가벼운 polling)
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

### 6. 정리 및 결과 출력 (Pane 회수)

1. 로그 파일에서 결과 수집 (정리 전에 수행):
```bash
TEAM_DIR="$PWD/.team-tmp"
TEAM="{팀이름}"
i=1
while read -r pane_id; do
  echo "=== Worker $i (pane: $pane_id) ==="
  tmux capture-pane -t "$pane_id" -p 2>/dev/null | tail -20 || echo "(pane already closed)"
  i=$((i+1))
done < "$TEAM_DIR/team-${TEAM}-worker-panes.txt"
```

2. **worker pane 회수** (리더 pane이 원래 넓이로 자동 복원):
```bash
TEAM_DIR="$PWD/.team-tmp"
TEAM="{팀이름}"
while read -r pane_id; do
  tmux kill-pane -t "$pane_id" 2>/dev/null || true
done < "$TEAM_DIR/team-${TEAM}-worker-panes.txt"

# pane 타이틀 표시 해제 (다른 팀 worker가 없을 때만)
REMAINING_TEAMS=$(ls "$TEAM_DIR"/team-*-worker-panes.txt 2>/dev/null | grep -v "team-${TEAM}-" | wc -l)
if [ "$REMAINING_TEAMS" -eq 0 ]; then
  tmux set-option -w pane-border-status off 2>/dev/null
fi
```
> Worker pane을 kill하면 tmux가 **해당 리더 pane만** 원래 넓이로 복원한다.
> 다른 리더의 worker pane에는 영향 없음 (팀 이름별 파일 격리).
> `pane-border-status off`는 **동일 window에 다른 팀 worker가 없을 때만** 해제한다.

3. 임시 파일 정리:
```bash
rm -f "$PWD/.team-tmp/team-{팀이름}-"*
# .team-tmp 디렉토리가 비면 삭제
[ -z "$(ls -A "$PWD/.team-tmp" 2>/dev/null)" ] && rm -rf "$PWD/.team-tmp"
```
> 다른 팀의 임시 파일이 남아있을 수 있으므로, **팀별 파일만 삭제**한다.

4. 레이아웃 복원 확인:
```bash
tmux list-panes -F "pane=#{pane_id} left=#{pane_left} size=#{pane_width}x#{pane_height}"
```

5. 결과 요약 출력

## 출력 형식

```
## Team 작업 완료

**팀**: {팀이름} ([N]명)
**작업**: [작업 설명]

### 수행 결과
| Worker | Pane | 태스크 | 상태 | 변경 파일 |
|--------|------|--------|------|----------|
| worker-1 | %xx | [태스크 설명] | DONE | [N]개 |
| worker-2 | %xx | [태스크 설명] | DONE | [N]개 |

### 검증
- ESLint: PASS (0 errors)
- TypeScript: PASS (0 errors)
- Tests: PASS ([N]/[N])

### 변경 요약
- 총 [N]개 파일 변경
- [주요 변경 내용 요약]
```

## 주의사항

### CRITICAL — 자기 영역만 분할 (v8 핵심)
- 리더 pane을 **가로 분할(`-h`)**하여 오른쪽에 worker 컬럼 생성 → 리더 **넓이만 임시로 줄어듦**
- worker pane kill 시 리더 pane 넓이 **자동 복원**
- **리더 외 다른 pane의 크기/위치/프로세스는 절대 변경하지 않는다**
- 복수 리더가 각각 `/team`을 실행해도 **서로의 영역에 간섭하지 않음**
- **break-pane, swap-pane, select-window 사용 금지** — 윈도우 상태 불안정 원인

### CRITICAL — 기존 pane에 send-keys/kill 금지
- **새로 생성한 worker pane에만** `send-keys` 사용
- 기존 pane(다른 Leader, Other CC, Status)에 `send-keys`/`kill-pane` 금지
- 팀 이름별로 `worker-panes.txt` 격리 → 다른 팀의 worker를 실수로 kill하지 않음

### CRITICAL — claude alias 충돌 방지
- `.bashrc`에 `alias claude=...`가 정의되어 있으면, tmux pane의 interactive shell에서 `claude -p`가 alias로 가로채진다
- **반드시 `command claude`로 호출**하여 alias를 우회한다 (runner 스크립트 템플릿 참고)
- `CLAUDE_CONFIG_DIR`을 runner 스크립트에 export하여 리더 세션의 인증 컨텍스트를 worker에 전파한다

### CRITICAL — shell init delay 필수
- tmux pane 생성 후 **반드시 `sleep 2`** 한 후 `send-keys` 실행
- 1초로는 shell 초기화가 완료되지 않아 명령이 누락될 수 있다

### 일반 규칙
- worker끼리 **같은 파일을 동시 수정하지 않도록** 태스크를 분할한다
- `--allowedTools` 미지정 시 승인 프롬프트가 떠서 pane이 멈춤 — 반드시 지정
- `--max-turns`로 무한 루프 방지 (기본 20, 복잡한 작업은 30까지)
- worker 프롬프트는 `.team-tmp/` 임시 파일 + **runner 스크립트**로 전달 (send-keys 내 `$(cat ...)` 확장 금지)
- runner 스크립트에서 `command claude`로 호출 + PATH를 명시적으로 설정하여 alias 충돌과 tmux pane 환경 차이를 해소
- git 작업(commit, push)은 worker에게 시키지 않는다 — 리더만 수행
- worker pane 최대 3개 권장 (같은 column 세로 분할이므로 3개 초과 시 높이 부족)
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
