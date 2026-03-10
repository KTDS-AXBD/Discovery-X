# req-interview 스킬 — Claude Code 설치 가이드

## 1. 스킬 파일 설치

```bash
# 스킬 디렉토리 생성 (없으면)
mkdir -p ~/.claude/skills

# req-interview.skill 파일을 다운로드한 위치에서 복사
# (예: Downloads 폴더에 있을 경우)
cp ~/Downloads/req-interview.skill ~/.claude/skills/

# 압축 해제
cd ~/.claude/skills
unzip req-interview.skill
```

설치 후 구조:
```
~/.claude/skills/
└── req-interview/
    ├── SKILL.md
    ├── templates/
    │   ├── interview-tree.md
    │   ├── prd-template.md
    │   └── review-prompts.md
    ├── references/
    │   └── scorecard.md
    └── scripts/
        └── init-project.sh
```

---

## 2. CLAUDE.md에 스킬 등록

프로젝트 또는 글로벌 CLAUDE.md에 아래 내용을 추가한다.

**글로벌 설정 (모든 프로젝트에서 사용):**
```bash
# ~/.claude/CLAUDE.md 에 추가
```

```markdown
## Skills

### req-interview
- 위치: ~/.claude/skills/req-interview/SKILL.md
- 트리거: "req-interview 시작", "인터뷰 시작", "새 프로젝트 기획", "PRD 검토 사이클"
- 설명: 요구사항 인터뷰 → PRD 작성 → 외부 AI 다중 검토 → 착수 판단 워크플로우
```

---

## 3. 프로젝트 작업 디렉토리 설정

기획 문서를 저장할 폴더를 만든다.

```bash
mkdir -p ~/projects/requirements
cd ~/projects/requirements
```

---

## 4. 첫 사용 테스트

Claude Code를 열고 아래 명령어로 시작:

```
req-interview 시작
```

또는

```
새 프로젝트 기획 시작해줘
```

---

## 5. 사용 흐름 요약

```
1. "req-interview 시작"
   → Claude가 인터뷰 진행 (5파트)
   → interview-log.md + prd-v1.md 자동 생성

2. 검토 패키지 자동 생성
   → review/round-1/ 폴더에 4개 AI 프롬프트 파일 생성
   → 각 파일 내용을 ChatGPT / Gemini / Claude / Grok에 붙여넣기

3. "검토의견 반영" + 피드백 텍스트 입력
   → PRD 업데이트 + 스코어카드 표시

4. 80점 이상 → 착수 준비 완료 선언
```

---

## 주요 명령어 모음

| 명령 | 설명 |
|------|------|
| `req-interview 시작` | 새 프로젝트 인터뷰 시작 |
| `PRD 검토 사이클 시작` | 기존 PRD 파일로 검토 시작 |
| `검토의견 반영` | AI 피드백 수집 후 반영 |
| `스코어 확인` | 현재 충분도 점수 표시 |
| `최종 PRD 생성` | 착수 준비 완료 선언 및 final 파일 생성 |
