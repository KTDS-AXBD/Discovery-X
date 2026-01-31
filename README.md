# Discovery-X

AX 신사업을 위한 내부 실험 중심 사고 시스템.
관찰을 행동으로 전환하고, 행동을 근거 있는 문서로 남기며, 실패를 조직 자산으로 축적합니다.

## 기술 스택

- Remix v2 (Vite) + Cloudflare Pages
- Cloudflare D1 (SQLite) + Drizzle ORM
- React 19 + Tailwind CSS 3
- TypeScript (strict)

## 개발

```bash
pnpm install
pnpm dev          # 로컬 개발 서버
pnpm build        # 프로덕션 빌드
pnpm deploy       # Cloudflare Pages 배포
```

## 프로젝트 문서

| 문서 | 역할 |
|------|------|
| `CLAUDE.md` | Claude Code 프로젝트 지침 (SDD) |
| `SPEC.md` | 프로젝트 사양서 (매 세션 업데이트) |
| `docs/Discovery-X_v1.4.md` | 비즈니스 기획서 |
| `docs/Discovery-X_Prototype_PRD_v0.1.md` | 요구사항 정의서 |
