import { json } from "@remix-run/cloudflare";
import { ServiceError } from "./service-errors";

const STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  UNAUTHORIZED: 403,
  CONFLICT: 409,
};

/**
 * ServiceError → Remix json Response 변환.
 * route action/loader의 catch 블록에서 사용:
 *
 * ```ts
 * try { ... }
 * catch (e) { return handleServiceError(e); }
 * ```
 */
export function handleServiceError(error: unknown) {
  if (error instanceof ServiceError) {
    const status = STATUS_MAP[error.code] ?? 500;
    return json({ error: error.toJSON() }, { status });
  }
  throw error; // ServiceError가 아니면 re-throw
}

/**
 * ServiceError인지 판별하고 HTTP 상태 코드를 반환.
 * 미들웨어/유틸에서 사용.
 */
export function getHttpStatus(error: unknown): number | null {
  if (error instanceof ServiceError) {
    return STATUS_MAP[error.code] ?? 500;
  }
  return null;
}
