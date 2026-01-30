---
name: deploy
user-invocable: true
description: CLAUDE.md 배포 섹션 기반으로 프로덕션/프리뷰 배포 수행. --preview 옵션으로 프리뷰 배포 가능.
---

# Deploy — CLAUDE.md 기반 배포

CLAUDE.md에 정의된 배포 설정을 참조하여 현재 코드를 배포한다.

**배포 URL, 호스팅 정보, 배포 명령어는 CLAUDE.md의 `## 배포` 섹션을 참조한다.**

## Arguments

`$ARGUMENTS`가 `--preview`를 포함하면 프리뷰 배포, 아니면 프로덕션 배포.
구체적인 배포 명령어는 CLAUDE.md의 `## 빌드 및 개발 명령어` 섹션에 정의된 deploy 관련 스크립트를 사용한다.

## Steps

### 1. 미커밋 변경사항 확인 및 커밋

```bash
git status
```

미커밋 변경사항이 있으면:
- 변경 내용을 분석하여 적절한 커밋 메시지 작성
- `git add` → `git commit` 수행

### 2. Lint 점검

CLAUDE.md에 정의된 lint 명령어를 실행한다.

에러 발견 시 자동 수정 후 재실행. 수정 후에도 실패하면 사용자에게 보고.

### 3. 빌드

CLAUDE.md에 정의된 build 명령어를 실행한다.

빌드 에러 발생 시:
- TypeScript 에러: 해당 파일 수정 후 재빌드
- 기타 에러: 사용자에게 보고

### 4. Git Push

CLAUDE.md의 `## 배포` 섹션에 정의된 배포 방식에 따라 push한다.
`$ARGUMENTS`에 `--preview` 포함 여부에 따라 프로덕션/프리뷰를 구분한다.

일반적인 Git 기반 배포의 경우:
- **프로덕션**: `git push origin main` (현재 브랜치가 `main`이어야 함)
- **프리뷰**: `git push origin HEAD` (현재 브랜치가 `main`이 아닌 브랜치여야 함)

프리뷰 배포 시 현재 브랜치가 `main`이면 사용자에게 경고하고 별도 브랜치 생성을 안내한다.

### 5. 결과 안내

Push 완료 후:
- 배포 트리거 완료 안내
- CLAUDE.md `## 배포` 섹션에 기재된 URL 안내
- 호스팅 대시보드에서 빌드 상태 확인 가능함을 안내
