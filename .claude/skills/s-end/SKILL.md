---
name: s-end
description: 세션 종료 시 코드 커밋 + SPEC.md 지표 갱신 + MEMORY.md 작업 컨텍스트 갱신 + CHANGELOG.md에 세션 기록 추가.
argument-hint: "[추가 메모]"
user-invocable: true
---

# Session End — 3-Tier 동기화 + Git 커밋

## 아키텍처

```
1. Git 커밋 (코드 변경)
2. SPEC.md §5 지표 갱신 (숫자만)
3. MEMORY.md 작업 컨텍스트 갱신 (다음 세션 복원용)
4. docs/CHANGELOG.md 세션 기록 추가 (히스토리 보존)
5. SPEC.md + CHANGELOG.md 커밋
6. Git push + CI/CD 배포 확인
```

## Git 변경사항 확인

```bash
!`git log --oneline -5`
```

```bash
!`git diff --stat`
```

## 지시사항

### Phase 1: Git 커밋

1. **변경사항 확인**: `git status` + `git diff`
2. **코드 변경사항 커밋** (SPEC.md, docs/CHANGELOG.md 제외):
   - 논리적 단위로 분리 가능하면 여러 커밋으로 나누기
   - 컨벤션: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
   - `.env`, 자격 증명 파일 커밋 금지
3. **타입 체크 + 빌드 확인**: `pnpm typecheck && pnpm lint`
   - 실패 시 수정 후 재시도

### Phase 2: SPEC.md §5 지표 갱신

SPEC.md를 읽고 §5 Current Status의 **숫자/지표만** 업데이트:

- 버전 문자열 (변경 시)
- 라우트/테이블/Agent 도구 수 (변경 시)
- 테스트 수/통과율
- Lint/Build 상태
- 배포 상태 (배포했으면)
- DB 마이그레이션 수 (추가했으면)

**세션 히스토리는 SPEC.md에 추가하지 않는다** — Phase 4에서 CHANGELOG.md에 추가.

### Phase 3: Auto Memory 갱신

Auto Memory 디렉토리의 파일들을 업데이트:

#### 3a. MEMORY.md (인덱스) 업데이트
1. **현재 버전 & 상태**: 버전/테스트/빌드 상태 최신화
2. **최근 세션 요약** (sliding window):
   - 이번 세션을 **맨 위에** 1줄 요약으로 추가
   - 3개를 초과하면 **가장 오래된 것 제거**
   - 형식: `- **세션 NNN** (YYYY-MM-DD): [1줄 요약]`
3. **주요 지표**: 변경된 숫자만 업데이트
4. **다음 작업**: 사용자가 언급한 다음 할 일 또는 "(세션 시작 시 사용자 지정)"

#### 3b. 토픽 파일 업데이트 (해당 시에만)
- **`service-layer.md`**: Service 메서드 추가/변경 시
- **`operations.md`**: Cron, 시크릿, 배포, 인프라 변경 시
- **`decisions.md`**: 새 아키텍처/운영 결정이 있을 때
- 새 토픽이 필요하면 파일 생성 + MEMORY.md 인덱스 테이블에 추가

### Phase 4: docs/CHANGELOG.md 세션 기록 추가

CHANGELOG.md **파일 상단**(헤더 바로 아래)에 이번 세션 상세 기록 추가:

```markdown
### 세션 NNN (YYYY-MM-DD)
**[작업 요약 1줄]**:
- ✅ [변경 1]
- ✅ [변경 2]
...

**검증 결과**:
- ✅ typecheck N 에러 / lint N 에러 / 테스트 N/N PASS / build 성공/실패
```

**기존 세션 기록 위에** 추가하여 최신이 위에 오도록 한다.

### Phase 5: 문서 커밋

```
git add SPEC.md docs/CHANGELOG.md
git commit -m "docs: update SPEC.md + CHANGELOG — 세션 NNN [요약]"
```

MEMORY.md는 Git 추적 대상이 아님 (auto memory 디렉토리).

### Phase 6: Git Push + CI/CD 배포

모든 커밋을 리모트에 push하여 CI/CD 배포를 자동 트리거한다.

```bash
git push origin master
```

Push 후 배포 상태를 확인한다:
```bash
gh run list --limit 1
```

- CI/CD가 성공하면 SPEC.md §5 배포 항목을 갱신하고 추가 커밋+push:
  ```bash
  # SPEC.md 배포 상태 업데이트 (예: "세션 NNN 배포 완료")
  git add SPEC.md && git commit -m "docs: update deployment status — 세션 NNN" && git push
  ```
- CI/CD 실패 시 `gh run view --log-failed`로 원인 확인 후 사용자에게 보고
- **`gh run watch`로 실시간 모니터링은 하지 않는다** — `gh run list`로 비동기 확인

> **참고**: 프리뷰 배포가 필요하면 별도로 `/deploy --preview`를 사용한다.

### Phase 7: GitHub Project 동기화 (선택)

§6 Implementation Log가 변경된 경우에만:
- AskUserQuestion으로 `/sync push` / `/sync status` / 건너뛰기 선택지 제시
- §6 변경 없으면 이 Phase를 건너뜀

### 최종 요약 출력

```
## 세션 종료 완료

### Git 커밋
- `abc1234` feat: [메시지]
- `def5678` docs: update SPEC.md + CHANGELOG — 세션 NNN

### 배포
- CI/CD: ✅ 성공 (N분 N초) / ❌ 실패 (원인)
- 프로덕션: https://dx.minu.best

### 업데이트
- SPEC.md §5: [변경된 지표]
- MEMORY.md: 컨텍스트 갱신 완료
- CHANGELOG.md: 세션 NNN 추가
```

## 주의사항

- SPEC.md에 세션 히스토리를 추가하지 않음 (CHANGELOG.md에만)
- MEMORY.md는 간결한 인덱스 유지 (~50줄 이내) — 상세 내용은 토픽 파일로 분산
- 토픽 파일 구조: `service-layer.md`, `operations.md`, `decisions.md` (필요 시 추가 생성)
- CHANGELOG.md는 최신이 파일 상단에 오도록 prepend
- `$ARGUMENTS` 추가 메모가 있으면 MEMORY.md "다음 작업"에 반영
