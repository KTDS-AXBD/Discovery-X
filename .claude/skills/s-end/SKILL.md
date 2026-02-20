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
5. SPEC.md + MEMORY.md + CHANGELOG.md 커밋
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

### Phase 3: MEMORY.md 작업 컨텍스트 갱신

Auto Memory의 MEMORY.md를 업데이트:

1. **현재 작업 컨텍스트** 섹션:
   - 버전/테스트/빌드 상태 최신화
   - "마지막 세션" → 이번 세션 내용으로 갱신
   - "다음 작업" → 사용자가 언급한 다음 할 일 또는 "(세션 시작 시 사용자 지정)"

2. **최근 세션 요약** 섹션 (sliding window):
   - 이번 세션을 **맨 위에** 1줄 요약으로 추가
   - 5개를 초과하면 **가장 오래된 것 제거**
   - 형식: `- **NNN**: [1줄 요약]`

3. **활성 결정사항**: 새 결정이 있으면 추가/수정

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

### Phase 6: GitHub Project 동기화 (선택)

§6 Implementation Log가 변경된 경우에만:
- AskUserQuestion으로 `/sync push` / `/sync status` / 건너뛰기 선택지 제시
- §6 변경 없으면 이 Phase를 건너뜀

### 최종 요약 출력

```
## 세션 종료 완료

### Git 커밋
- `abc1234` feat: [메시지]
- `def5678` docs: update SPEC.md + CHANGELOG — 세션 NNN

### 업데이트
- SPEC.md §5: [변경된 지표]
- MEMORY.md: 컨텍스트 갱신 완료
- CHANGELOG.md: 세션 NNN 추가

### 다음 단계
- 배포 필요 시: `/deploy` 또는 `/deploy --preview`
```

## 주의사항

- SPEC.md에 세션 히스토리를 추가하지 않음 (CHANGELOG.md에만)
- MEMORY.md 200줄 제한 — 초과 시 topic files로 분산
- CHANGELOG.md는 최신이 파일 상단에 오도록 prepend
- `$ARGUMENTS` 추가 메모가 있으면 MEMORY.md "다음 작업"에 반영
