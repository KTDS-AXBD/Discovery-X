# Discovery-X

AX 신사업을 위한 내부 실험 중심 사고 시스템.
관찰을 행동으로 전환하고, 행동을 근거 있는 문서로 남기며, 실패를 조직 자산으로 축적합니다.

**프로덕션**: https://dx.minu.best
**상태**: 운영 실험 진행 중 (2026-01-31~, 30-60일, 최대 5명)

## 기술 스택

- **Runtime**: Cloudflare Pages (Edge)
- **Framework**: Remix v2 (Vite)
- **DB**: Cloudflare D1 (SQLite) + Drizzle ORM
- **UI**: React 19 + Tailwind CSS 4
- **Language**: TypeScript (strict)

## 개발

```bash
pnpm install
pnpm dev          # 로컬 개발 서버
pnpm build        # 프로덕션 빌드
pnpm typecheck    # TypeScript 타입 체크
pnpm lint         # ESLint
pnpm deploy       # Cloudflare Pages 배포
```

## 프로젝트 문서

| 문서 | 역할 |
|------|------|
| `CLAUDE.md` | Claude Code 프로젝트 지침 (SDD) |
| `SPEC.md` | 프로젝트 사양서 (매 세션 업데이트) |
| `docs/Discovery-X_v1.4.md` | 비즈니스 기획서 |
| `docs/Discovery-X_Prototype_PRD_v0.1.md` | 요구사항 정의서 |
| `docs/OPERATIONAL_RUNBOOK.md` | 운영 런북 (주간/월간 절차) |
| `docs/USER_CHEAT_SHEET.md` | 1페이지 사용자 치트시트 |
| `docs/KICKOFF_TEMPLATE.md` | 킥오프 프레젠테이션 템플릿 |
| `docs/qa-checklist.md` | QA 체크리스트 (80+ 항목) |
| `docs/user-guide.md` | 사용자 매뉴얼 |
