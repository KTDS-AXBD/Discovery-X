const MAX_CODE_SIZE = 10_240; // 10KB

/** 위험한 패턴 목록 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /<script\s+[^>]*src\s*=/gi, // 외부 스크립트
  /<link\s+[^>]*href\s*=/gi, // 외부 CSS
  /<iframe/gi, // 중첩 iframe
  /<object/gi, // Object 임베드
  /<embed/gi, // Embed 태그
  /document\.cookie/gi, // 쿠키 접근 시도
  /localStorage|sessionStorage/gi, // 스토리지 접근 시도
  /window\.open\s*\(/gi, // 팝업 시도
  /top\.location|parent\.location/gi, // 네비게이션 시도
];

export interface SanitizeResult {
  code: string;
  warnings: string[];
  blocked: boolean;
}

export function sanitizeWidgetCode(rawCode: string): string {
  const result = sanitizeWidgetCodeDetailed(rawCode);
  if (result.blocked) {
    throw new Error(
      `위젯 코드가 보안 정책을 위반합니다: ${result.warnings.join(", ")}`
    );
  }
  return result.code;
}

export function sanitizeWidgetCodeDetailed(rawCode: string): SanitizeResult {
  const warnings: string[] = [];

  // 1. 사이즈 체크
  if (rawCode.length > MAX_CODE_SIZE) {
    return {
      code: "",
      warnings: [
        `코드 사이즈 초과 (${rawCode.length} > ${MAX_CODE_SIZE})`,
      ],
      blocked: true,
    };
  }

  let code = rawCode;

  // 2. 위험 패턴 제거
  for (const pattern of DANGEROUS_PATTERNS) {
    // RegExp.test() advances lastIndex for /g — reset before use
    pattern.lastIndex = 0;
    if (pattern.test(code)) {
      warnings.push(`차단된 패턴: ${pattern.source}`);
      pattern.lastIndex = 0;
      code = code.replace(pattern, "<!-- blocked -->");
    }
  }

  // 3. 외부 fetch/XHR 경고 (CSP가 차단하므로 제거까지는 안 함)
  if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/g.test(code)) {
    warnings.push("네트워크 요청 코드 감지 — CSP에 의해 차단됨");
  }

  return { code, warnings, blocked: false };
}
