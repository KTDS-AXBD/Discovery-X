---
name: team
description: Agent Teams를 tmux split pane에서 병렬 수행한다. 각 worker가 별도 pane에서 실시간 가시적으로 작업.
argument-hint: "<작업 설명>"
user-invocable: true
---

# Team — tmux Split Pane Agent Teams

`$ARGUMENTS`로 전달된 작업을 분석하여, tmux split pane에서 병렬 `claude -p` 인스턴스를 실행한다.
각 worker의 작업 과정을 실시간으로 확인할 수 있다.

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
TEAM_DIR="$PWD/.team-tmp"
mkdir -p "$TEAM_DIR"
```

```bash
cat > "$TEAM_DIR/team-{팀이름}-worker-{N}.txt" << 'PROMPT'
[worker 프롬프트 내용]
PROMPT
```

### 3. Launcher 스크립트 생성 및 실행 (tmux window + pane + worker 스폰)

> **CRITICAL**: 이 단계는 반드시 **단일 launcher 스크립트**로 실행해야 한다.
> tmux window 생성, pane 분할, worker 실행을 개별 Bash 호출로 분리하면 안 된다.
> 백그라운드 프로세스로 대체하는 것도 금지한다 — 반드시 tmux pane으로 실행한다.

**3a. worker runner 스크립트**를 생성한다 (worker 수만큼 반복).
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
prompt=\$(cat "$TEAM_DIR/team-{팀이름}-worker-{N}.txt")
command claude -p "\$prompt" \\
  --allowedTools 'Read,Edit,Write,Glob,Grep,Bash' \\
  --max-turns 20 \\
  --verbose 2>&1 | tee "$TEAM_DIR/team-{팀이름}-worker-{N}.log"
echo '=== WORKER-{N} DONE ===' >> "$TEAM_DIR/team-{팀이름}-worker-{N}.log"
RUNNER
chmod +x "$TEAM_DIR/team-{팀이름}-run-{N}.sh"
```

> **주의**: heredoc에서 `$PROJECT_DIR`, `$TEAM_DIR`, `$CLAUDE_CFG`는 **생성 시점에 확장**시킨다 (경로를 하드코딩).
> `\$PATH`, `\$prompt` 등 runner 실행 시점 변수는 이스케이프한다.
> **`command claude`**: `.bashrc`의 `alias claude=...`를 우회하여 실제 바이너리를 호출한다.
> **`CLAUDE_CONFIG_DIR`**: 리더 세션의 인증 컨텍스트(personal/work)를 worker에 전파한다.

**3b. launcher 스크립트를 생성**한다. worker 수(N)에 맞게 아래 템플릿을 사용:

> **핵심**: **team 전용 window**를 생성(`new-window -d`)하여 worker pane을 배치한다.
> 리더 window의 기존 pane 레이아웃을 건드리지 않으므로 레이아웃 충돌이 없다.
> `Ctrl+b n/p`로 리더 window ↔ team window 간 즉시 전환 가능.
> `even-vertical` 레이아웃으로 각 worker가 **전체 너비 × 균등 높이**를 확보한다.

```bash
CURRENT_SESSION=$(tmux display-message -p '#S')

cat > "$TEAM_DIR/team-{팀이름}-launcher.sh" << LAUNCHER
#!/usr/bin/env bash
set -e
TEAM="{팀이름}"
SESSION="$CURRENT_SESSION"
PROJECT_DIR="$PROJECT_DIR"
TEAM_DIR="$TEAM_DIR"
TEAM_WINDOW="team-\${TEAM}"

# 0) 기존 team window 정리 (재실행 시)
tmux kill-window -t "\$TEAM_WINDOW" 2>/dev/null || true
rm -f "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"

# 1) Team 전용 window 생성 + Worker 1 (window의 첫 pane)
W1=\$(tmux new-window -d -n "\$TEAM_WINDOW" -c "\$PROJECT_DIR" -P -F '#{pane_id}')
echo "\$W1" > "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
tmux send-keys -t "\$W1" "bash \$TEAM_DIR/team-\${TEAM}-run-1.sh" Enter

# 2) Worker 2 — W1 아래에 수평 분할
W2=\$(tmux split-window -v -d -t "\$W1" -c "\$PROJECT_DIR" -P -F '#{pane_id}')
echo "\$W2" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
tmux send-keys -t "\$W2" "bash \$TEAM_DIR/team-\${TEAM}-run-2.sh" Enter

# 3) Worker 3 (필요 시)
# W3=\$(tmux split-window -v -d -t "\$W2" -c "\$PROJECT_DIR" -P -F '#{pane_id}')
# echo "\$W3" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
# tmux send-keys -t "\$W3" "bash \$TEAM_DIR/team-\${TEAM}-run-3.sh" Enter

# 4) Worker 4 (필요 시)
# W4=\$(tmux split-window -v -d -t "\$W3" -c "\$PROJECT_DIR" -P -F '#{pane_id}')
# echo "\$W4" >> "\$TEAM_DIR/team-\${TEAM}-worker-panes.txt"
# tmux send-keys -t "\$W4" "bash \$TEAM_DIR/team-\${TEAM}-run-4.sh" Enter

# 5) 균등 레이아웃 적용 (각 worker 전체 너비 × 균등 높이)
tmux select-layout -t "\$TEAM_WINDOW" even-vertical

# 6) Team window 이름 저장
echo "\$TEAM_WINDOW" > "\$TEAM_DIR/team-\${TEAM}-window.txt"

echo "Team window '\$TEAM_WINDOW' created in session '\$SESSION'"
tmux list-panes -t "\$TEAM_WINDOW" -F "pane=#{pane_id} pid=#{pane_pid} size=#{pane_width}x#{pane_height}"
LAUNCHER
chmod +x "$TEAM_DIR/team-{팀이름}-launcher.sh"
```

> **worker 수에 따라 주석(#)을 해제**하여 3명, 4명 구성을 만든다.
> **team 전용 window**: `new-window -d`로 생성하므로 리더의 기존 레이아웃에 영향 없다. `-d` 플래그로 리더 window에 포커스가 유지된다.
> **균등 레이아웃**: `even-vertical`로 각 worker가 전체 너비를 사용하여 Claude 출력이 잘 보인다.

**3c. launcher를 실행**한다:

WSL 직접 실행 환경 (WSL_DIRECT):
```bash
bash "$TEAM_DIR/team-{팀이름}-launcher.sh"
```

Git Bash 환경 (GIT_BASH):
```bash
wsl -e bash -c "bash $WSL_TEAM_DIR/team-{팀이름}-launcher.sh"
```

**3d. team window 및 worker pane 생성을 검증**한다:
```bash
TEAM_DIR="$PWD/.team-tmp"
TEAM_WINDOW=$(cat "$TEAM_DIR/team-{팀이름}-window.txt" 2>/dev/null)
echo "Team window: $TEAM_WINDOW"
tmux list-panes -t "$TEAM_WINDOW" -F "pane=#{pane_id} pid=#{pane_pid} size=#{pane_width}x#{pane_height}" 2>/dev/null || echo "MISSING: team window not found"
i=1
while read -r pane_id; do
  if tmux display-message -t "$pane_id" -p "#{pane_id}" 2>/dev/null; then
    echo "Worker $i ($pane_id): OK"
  else
    echo "Worker $i ($pane_id): MISSING"
  fi
  i=$((i+1))
done < "$TEAM_DIR/team-{팀이름}-worker-panes.txt"
```
- team window가 존재하고 worker pane 수가 일치하는지 확인한다
- 불일치하면 launcher 스크립트를 다시 실행한다

사용자에게 안내한다:
```
Team window '{팀이름}'이 생성되었습니다.
Worker 확인: Ctrl+b n (다음 window) | Ctrl+b p (이전 window)
Worker 완료 후 team window가 자동으로 정리됩니다.
```

**team window 레이아웃 (2명, even-vertical)**:
```
+------------------------------------+
|  Worker 1 (전체 너비)               |
+------------------------------------+
|  Worker 2 (전체 너비)               |
+------------------------------------+
```
> 리더 window와 별도 — Ctrl+b n/p로 전환

**team window 레이아웃 (4명, even-vertical)**:
```
+------------------------------------+
|  Worker 1 (전체 너비)               |
+------------------------------------+
|  Worker 2 (전체 너비)               |
+------------------------------------+
|  Worker 3 (전체 너비)               |
+------------------------------------+
|  Worker 4 (전체 너비)               |
+------------------------------------+
```

### 4. 모니터링

Worker들의 완료를 대기한다. 로그 파일 기반으로 진행 상황을 확인:

```bash
TEAM_DIR="$PWD/.team-tmp"
for i in 1 2; do
  if grep -q "WORKER-${i} DONE" "$TEAM_DIR/team-{팀이름}-worker-${i}.log" 2>/dev/null; then
    echo "Worker ${i}: DONE"
  else
    echo "Worker ${i}: RUNNING"
  fi
done
```

tmux pane 내용을 직접 확인하려면 (worker pane ID 파일 사용):
```bash
TEAM_DIR="$PWD/.team-tmp"
i=1
while read -r pane_id; do
  echo "=== Worker $i (pane: $pane_id) ==="
  tmux capture-pane -t "$pane_id" -p 2>/dev/null || echo "(pane closed)"
  i=$((i+1))
done < "$TEAM_DIR/team-{팀이름}-worker-panes.txt"
```

**모니터링 규칙:**
- launcher 실행 후, 리더 pane에 포커스가 유지된다 (`new-window -d` 사용)
- worker 진행 상황은 `Ctrl+b n`으로 team window 전환 후 확인, 또는 위 로그 체크 명령으로 확인
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

1. 로그 파일에서 결과 수집 (정리 전에 수행):
```bash
TEAM_DIR="$PWD/.team-tmp"
i=1
while read -r pane_id; do
  echo "=== Worker $i (pane: $pane_id) ==="
  tmux capture-pane -t "$pane_id" -p 2>/dev/null || echo "(pane already closed)"
  i=$((i+1))
done < "$TEAM_DIR/team-{팀이름}-worker-panes.txt"
```

2. team window 종료:
```bash
TEAM_DIR="$PWD/.team-tmp"
TEAM_WINDOW=$(cat "$TEAM_DIR/team-{팀이름}-window.txt" 2>/dev/null)
tmux kill-window -t "$TEAM_WINDOW" 2>/dev/null || true
```

3. 임시 파일 정리:
```bash
rm -rf "$PWD/.team-tmp"
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
- **반드시 tmux pane에서 실행**: Step 3의 launcher 스크립트를 통해 tmux window/pane을 생성해야 한다
- pane 생성 후 `tmux list-panes`로 검증해야 한다 — 실패하면 재시도

### CRITICAL — claude alias 충돌 방지
- `.bashrc`에 `alias claude=...`가 정의되어 있으면, tmux pane의 interactive shell에서 `claude -p`가 alias로 가로채진다
- **반드시 `command claude`로 호출**하여 alias를 우회한다 (runner 스크립트 템플릿 참고)
- `CLAUDE_CONFIG_DIR`을 runner 스크립트에 export하여 리더 세션의 인증 컨텍스트를 worker에 전파한다

### CRITICAL — team 전용 window 사용 (리더 레이아웃 보존)
- **`tmux new-window -d`로 team 전용 window를 생성**한다 — 리더 window의 기존 pane 레이아웃에 영향 없음
- `-d` 플래그로 리더 window에 포커스가 유지된다 (team window로 자동 전환 안 됨)
- `even-vertical` 레이아웃으로 각 worker가 **전체 너비 × 균등 높이**를 확보 → Claude 출력이 잘 보임
- 정리 시 `tmux kill-window -t $TEAM_WINDOW`로 team window 전체 종료 (리더 window/session 영향 없음)
- worker pane ID는 `$TEAM_DIR/team-{팀이름}-worker-panes.txt`에, window 이름은 `team-{팀이름}-window.txt`에 저장
- 사용자는 `Ctrl+b n/p`로 리더 window ↔ team window 간 전환

### 일반 규칙
- worker끼리 **같은 파일을 동시 수정하지 않도록** 태스크를 분할한다
- `--allowedTools` 미지정 시 승인 프롬프트가 떠서 pane이 멈춤 — 반드시 지정
- `--max-turns`로 무한 루프 방지 (기본 20, 복잡한 작업은 30까지)
- worker 프롬프트는 `.team-tmp/` 임시 파일 + **runner 스크립트**로 전달 (send-keys 내 `$(cat ...)` 확장 금지)
- runner 스크립트에서 `command claude`로 호출 + PATH를 명시적으로 설정하여 alias 충돌과 tmux pane 환경 차이를 해소
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
