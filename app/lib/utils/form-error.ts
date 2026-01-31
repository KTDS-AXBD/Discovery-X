/**
 * Extract a user-friendly error message from an unknown error.
 * Used in Remix action catch blocks for form validation errors.
 */
export function getFormErrorMessage(error: unknown, fallback = "입력값이 유효하지 않습니다"): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}
