# Claude Project Template

Claude Code + Cline을 위한 프로젝트 템플릿.
Memory Bank 기반 컨텍스트 관리와 세션 워크플로우를 포함합니다.

## 사용법

### 1. 이 템플릿으로 새 레포 생성

GitHub에서 "Use this template"을 클릭하거나:

```bash
git clone https://github.com/user/claude-project-template my-new-project
cd my-new-project
rm -rf .git && git init
```

### 2. CLAUDE.md 작성

`CLAUDE.md`를 열고 TODO 항목을 프로젝트에 맞게 채우세요:
- 프로젝트 개요
- 빌드/개발 명령어
- 기술 스택
- 프로젝트 구조
- 코드 컨벤션
- 배포 설정

### 3. Memory Bank 초기 내용 작성

`memory-bank/` 디렉토리의 6개 파일에 프로젝트 초기 정보를 입력하세요:
- `projectBrief.md` — 프로젝트 기초 정보
- `productContext.md` — 제품 비전, 사용자 워크플로우
- `systemPatterns.md` — 아키텍처, 코드 패턴
- `techContext.md` — 기술 스택, 개발 환경
- `activeContext.md` — 현재 작업 상태
- `progress.md` — 구현 현황 체크리스트

### 4. .clinerules 프로젝트 컨벤션 추가

`.clinerules`의 TODO 항목을 프로젝트에 맞게 채우세요.

### 5. (선택) 워크플로우 플러그인 설치

세션 관리 스킬 (`/session-start`, `/session-end`, `/deploy`)을 사용하려면:

```bash
claude plugin install /path/to/claude-project-workflow
```

## 포함된 파일

```
.claude/
├── settings.json         # 기본 권한 설정
└── skills/               # 프로젝트별 스킬 (비어있음)
memory-bank/
├── projectBrief.md       # 프로젝트 기초
├── productContext.md      # 제품 맥락
├── systemPatterns.md      # 아키텍처 패턴
├── techContext.md         # 기술 스택
├── activeContext.md       # 현재 작업 상태
└── progress.md            # 구현 현황
CLAUDE.md                  # Claude Code 프로젝트 지침
.clinerules                # Cline 규칙
.gitignore                 # Git 무시 패턴
```

## 워크플로우

```
세션 시작: /session-start [작업내용]
  → Memory Bank에서 컨텍스트 복원
  → 현재 상태 요약 출력

작업 수행
  → 코드 작성, 디버깅, 리팩토링 등

세션 종료: /session-end [메모]
  → 코드 변경사항 커밋
  → Memory Bank 업데이트
  → Cline에서 이어받기 가능

배포: /deploy [--preview]
  → lint → build → git push → 자동 배포
```

## Claude Code ↔ Cline 연동

```
Claude Code: /session-end [메모] → Memory Bank 업데이트
Cline: "follow your custom instructions" → 업데이트된 Memory Bank로 이어받기
```
