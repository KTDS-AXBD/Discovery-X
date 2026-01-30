# Claude Project Template

Claude Code 프로젝트 템플릿.
SPEC.md 기반 SDD (Spec Driven Development) 워크플로우를 포함합니다.

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

### 3. SPEC.md 초기 내용 작성

`SPEC.md`의 6개 섹션에 프로젝트 초기 정보를 입력하세요:
- §1 Project Overview — 미션, 범위, 성공 기준, 대상 사용자
- §2 Product Design — 핵심 워크플로우, UI 요소, 페이지 구성
- §3 Architecture Patterns — 라우팅, 상태관리, 컴포넌트, 데이터 흐름
- §4 Technical Constraints — 빌드 산출물, 제약사항
- §5 Current Status — 현재 작업 상태 (매 세션 업데이트)
- §6 Implementation Log — 완료 요약, 미래 작업

### 4. (선택) 워크플로우 플러그인 설치

세션 관리 스킬 (`/session-start`, `/session-end`, `/deploy`)을 사용하려면:

```bash
claude plugin install /path/to/claude-project-workflow
```

## 포함된 파일

```
.claude/
├── settings.json         # 기본 권한 설정
└── skills/
    ├── session-start/    # 세션 시작 스킬
    ├── session-end/      # 세션 종료 스킬
    └── deploy/           # 배포 스킬
SPEC.md                    # 프로젝트 사양서 (SDD)
CLAUDE.md                  # Claude Code 프로젝트 지침
.gitignore                 # Git 무시 패턴
```

## 워크플로우

```
세션 시작: /session-start [작업내용]
  → SPEC.md에서 컨텍스트 복원
  → 현재 상태 요약 출력

작업 수행
  → 코드 작성, 디버깅, 리팩토링 등

세션 종료: /session-end [메모]
  → 코드 변경사항 커밋
  → SPEC.md 업데이트

배포: /deploy [--preview]
  → lint → build → git push → 자동 배포
```
