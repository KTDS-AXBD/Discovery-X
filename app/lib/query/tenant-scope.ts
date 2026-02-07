import { eq, and, type SQL } from "drizzle-orm";

/**
 * Root 엔티티 쿼리에 tenant 스코프를 적용하는 헬퍼.
 * 자식 엔티티는 부모 FK로 자동 격리되므로 이 헬퍼 불필요.
 */
export function tenantWhere<T extends { tenantId: any }>(
  table: T,
  tenantId: string,
  additionalWhere?: SQL
): SQL {
  const tenantCondition = eq(table.tenantId, tenantId);
  return additionalWhere
    ? and(tenantCondition, additionalWhere)!
    : tenantCondition;
}
