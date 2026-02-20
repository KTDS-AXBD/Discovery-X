---
name: db-migrate
description: Drizzle 마이그레이션 생성 → 로컬 적용 → test helper 동기화를 한 번에 수행. 스키마 변경 후 사용.
---

# db-migrate — 마이그레이션 원스텝 실행

Drizzle 스키마 변경 후, 마이그레이션 생성부터 테스트 헬퍼 동기화까지 한 번에 수행합니다.

## Steps

### 1. 마이그레이션 생성

```bash
pnpm db:generate
```

새로 생성된 SQL 파일 이름을 확인합니다.

### 2. 로컬 D1에 적용

```bash
pnpm db:migrate
```

### 3. tests/helpers/db.ts 동기화 (CRITICAL)

`drizzle/` 디렉토리의 SQL 파일 목록과 `tests/helpers/db.ts`의 `runMigrationSQL` 호출을 비교합니다.

새로 추가된 SQL 파일에 대해 `runMigrationSQL` 호출을 `tests/helpers/db.ts`에 추가합니다.

기존 패턴을 따릅니다:
```typescript
runMigrationSQL(sqlite, resolve(migrationsDir, "NNNN_migration_name.sql"));
```

### 4. 검증

```bash
pnpm test:unit
```

유닛 테스트가 통과하는지 확인합니다. "no such table" 에러가 나면 Step 3에서 누락된 SQL 파일이 있는지 재확인합니다.
