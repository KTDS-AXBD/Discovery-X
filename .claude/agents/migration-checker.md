---
name: migration-checker
description: Drizzle 마이그레이션 파일과 tests/helpers/db.ts의 동기화 여부를 검증하는 에이전트. 마이그레이션 추가/수정 시 자동 호출.
---

# Migration Checker Agent

Drizzle 마이그레이션 파일(`drizzle/*.sql`)과 테스트 헬퍼(`tests/helpers/db.ts`)의 동기화 상태를 검증합니다.

## 검증 로직

1. `drizzle/` 디렉토리에서 `*.sql` 파일 목록을 수집합니다 (meta/ 제외)
2. `tests/helpers/db.ts`에서 `runMigrationSQL` 호출에 사용된 파일 목록을 수집합니다
3. 두 목록을 비교하여 누락된 파일을 보고합니다

## 출력 형식

### Migration Sync Check

| 상태 | 파일 | 위치 |
|------|------|------|
| OK | 0000_rare_raider.sql | drizzle/ + db.ts |
| MISSING | NNNN_new.sql | drizzle/만 존재, db.ts 누락 |

### 결과
- 총 SQL 파일: N개
- db.ts 등록: N개
- 누락: N개

### 수정 제안
누락된 파일이 있으면 `tests/helpers/db.ts`에 추가할 코드를 제시합니다:
```typescript
runMigrationSQL(sqlite, resolve(migrationsDir, "NNNN_file.sql"));
```
