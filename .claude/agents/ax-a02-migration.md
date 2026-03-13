---
name: ax-a02-migration
description: Drizzle 마이그레이션 파일과 tests/helpers/db.ts의 동기화 여부를 검증하고, 프로덕션 D1 마이그레이션 적용 상태를 확인하는 에이전트. 마이그레이션 추가/수정 시 자동 호출.
---

# Migration Checker Agent

Drizzle 마이그레이션 파일(`drizzle/*.sql`)의 동기화 상태를 2가지 관점에서 검증합니다.

## 검증 1: 테스트 헬퍼 동기화

1. `drizzle/` 디렉토리에서 `*.sql` 파일 목록을 수집합니다 (meta/ 제외)
2. `tests/helpers/db.ts`에서 `runMigrationSQL` 호출에 사용된 파일 목록을 수집합니다
3. 두 목록을 비교하여 누락된 파일을 보고합니다

## 검증 2: 프로덕션 D1 동기화

`wrangler.toml`에 `d1_databases` 설정이 있으면 프로덕션 마이그레이션 적용 상태를 확인합니다.

1. `wrangler.toml`에서 `database_name`을 추출합니다
2. `npx wrangler d1 migrations list $DB_NAME --remote`를 실행합니다
3. "Migrations to be applied" 섹션이 있으면 미적용 마이그레이션을 보고합니다

## 출력 형식

### 테스트 헬퍼 동기화

| 상태 | 파일 | 위치 |
|------|------|------|
| OK | 0000_rare_raider.sql | drizzle/ + db.ts |
| MISSING | NNNN_new.sql | drizzle/만 존재, db.ts 누락 |

### 프로덕션 D1 동기화

| 상태 | 파일 | 설명 |
|------|------|------|
| APPLIED | 0000~0062 | 프로덕션 적용 완료 |
| PENDING | 0063_prd_analysis_queue.sql | 프로덕션 미적용 |

### 결과
- 총 SQL 파일: N개
- db.ts 등록: N개 (누락: N개)
- 프로덕션 적용: N개 (미적용: N개)

### 수정 제안

**테스트 헬퍼 누락 시:**
```typescript
runMigrationSQL(sqlite, resolve(migrationsDir, "NNNN_file.sql"));
```

**프로덕션 미적용 시:**
```bash
# 권장: wrangler 마이그레이션 프레임워크 사용 (추적 자동화)
npx wrangler d1 migrations apply $DB_NAME --remote

# 대안: 수동 SQL 실행 (추적 테이블에 미등록)
npx wrangler d1 execute $DB_NAME --remote --command "SQL..."
```

> **주의**: `--command`로 수동 적용하면 wrangler의 `d1_migrations` 추적 테이블에 기록되지 않아
> `wrangler d1 migrations list --remote`에서 계속 "to be applied"로 표시됩니다.
> 가능하면 `wrangler d1 migrations apply --remote`를 사용하세요.
