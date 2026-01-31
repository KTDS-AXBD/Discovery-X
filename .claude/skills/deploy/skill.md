---
name: deploy
user-invocable: true
description: Cloudflare Pages 배포 수행 (pnpm deploy). --preview 옵션으로 프리뷰 배포 가능.
---

# Deploy — Cloudflare Pages 배포

현재 코드를 Cloudflare Pages에 배포한다.

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

### 2. 타입 체크

```bash
pnpm typecheck
```

에러 발견 시 해당 파일 수정 후 재실행. 수정 후에도 실패하면 사용자에게 보고.

### 3. 빌드

```bash
pnpm build
```

빌드 에러 발생 시:
- TypeScript 에러: 해당 파일 수정 후 재빌드
- 기타 에러: 사용자에게 보고

### 4. DB 마이그레이션 확인

스키마 변경(`drizzle/` 디렉토리 내 변경)이 있는지 확인:

```bash
git diff --name-only HEAD~1 -- drizzle/
```

변경이 있으면 사용자에게 `pnpm db:migrate:prod` 실행 필요 여부를 안내한다.

### 5. 배포

`$ARGUMENTS`에 `--preview` 포함 여부에 따라 분기:

- **프로덕션**:
  ```bash
  git push origin master
  pnpm deploy
  ```

- **프리뷰**:
  ```bash
  wrangler pages deploy ./build/client --branch=preview
  ```

### 6. 결과 안내

배포 완료 후:
- wrangler 출력에서 배포 URL을 추출하여 안내
- 프리뷰 배포 시 프리뷰 URL 안내
- 배포 실패 시 에러 내용을 사용자에게 보고
