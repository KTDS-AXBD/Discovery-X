---
name: lint
description: 변경된 파일의 ESLint + TypeScript 에러를 점검하고 수정한다.
user-invocable: true
---

# Lint — ESLint + TypeScript 점검

변경된 파일을 대상으로 lint와 타입 체크를 실행하고, 발견된 에러를 수정한다.

## Steps

### 1. 변경 파일 범위 파악

git diff로 현재 변경된 `.ts`, `.tsx` 파일 목록을 수집한다:
- `git diff --name-only` (unstaged)
- `git diff --name-only --cached` (staged)
- `git diff --name-only HEAD~1` (최근 커밋)

`.ts`, `.tsx` 파일만 필터링하여 점검 대상으로 삼는다.

### 2. ESLint 실행

변경된 파일만 대상으로 ESLint를 실행한다:

```bash
pnpm lint -- [변경된 파일 목록]
```

- auto-fixable 에러는 `--fix` 플래그로 자동 수정
- 수정 불가능한 에러는 목록으로 정리

### 3. TypeScript 타입 체크

```bash
pnpm typecheck
```

- 전체 프로젝트 타입 체크 (tsc는 파일 단위 실행 불가)
- 에러 중 Step 1의 변경 파일에 해당하는 것만 수정 대상

### 4. 에러 수정

변경 파일 범위 내 에러만 수정:
- ESLint auto-fix로 해결되지 않은 lint 에러 수동 수정
- TypeScript 타입 에러 수정
- 수정 후 `pnpm lint` + `pnpm typecheck` 재실행하여 검증
- 새 에러가 발생하면 롤백하고 사용자에게 보고
- 변경 파일 외의 에러는 수정하지 않고 참고로 표시

### 5. 결과 출력

```
## Lint 점검 완료

### 결과
- 점검 대상: [N]개 파일
- ESLint 에러: [N]개 발견 → [N]개 수정
- TypeScript 에러: [N]개 발견 → [N]개 수정
- 남은 에러: [N]개 (변경 파일 외)

### 수정 내역
- `파일명:라인` — [에러 설명] → [수정 내용]

### 변경 파일 외 에러 (참고)
- `파일명:라인` — [에러 설명]
```
