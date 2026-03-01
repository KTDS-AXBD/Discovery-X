---
name: deploy
user-invocable: true
description: Cloudflare Pages 배포 수행. CI/CD (GitHub Actions) 기반. --preview 옵션으로 프리뷰 배포 가능.
---

# Deploy — Cloudflare Pages 배포 (CI/CD)

> **참고**: 일반적인 프로덕션 배포는 `/s-end`에 포함되어 있다 (Phase 6: Git Push + CI/CD).
> `/deploy`는 **프리뷰 배포** 또는 **명시적 재배포**가 필요할 때만 사용한다.

## Arguments

`$ARGUMENTS`가 `--preview`를 포함하면 프리뷰 배포, 아니면 프로덕션 배포.

## Steps

### 1. 미커밋 변경사항 확인 및 커밋

```bash
git status
```

미커밋 변경사항이 있으면:
- 변경 내용을 분석하여 적절한 커밋 메시지 작성
- `git add` → `git commit` 수행

### 2. 검증 (lint + typecheck + test)

```bash
pnpm typecheck && pnpm lint && pnpm test
```

에러/실패 시 수정 후 재실행. 해결 불가 시 사용자에게 보고.

### 3. DB 마이그레이션 확인

스키마 변경(`drizzle/` 디렉토리 내 변경)이 있는지 확인:

```bash
git diff --name-only HEAD~1 -- drizzle/
```

변경이 있으면 사용자에게 `pnpm db:migrate:prod` 실행 필요 여부를 안내한다.

### 4. 배포

`$ARGUMENTS`에 `--preview` 포함 여부에 따라 분기:

- **프로덕션** (CI/CD):
  ```bash
  git push origin master
  ```
  Push하면 GitHub Actions가 자동으로:
  1. Install → Lint → Typecheck → Test → Build → Deploy 수행
  2. `gh run list --limit 1`로 배포 상태 확인

- **프리뷰** (로컬):
  ```bash
  pnpm build
  wrangler pages deploy ./build/client --branch=preview
  ```

### 5. 결과 안내

배포 완료 후:
- 프로덕션: https://dx.minu.best 접근 가능 여부 확인 후 안내
- 프리뷰: wrangler 출력에서 프리뷰 URL 추출하여 안내
- 실패 시: GitHub Actions 로그 확인 방법 안내 (`gh run view --log-failed`)
