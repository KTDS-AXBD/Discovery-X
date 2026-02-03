/**
 * UUID 생성 유틸리티
 */

export function generateUUID(): string {
  return crypto.randomUUID();
}
