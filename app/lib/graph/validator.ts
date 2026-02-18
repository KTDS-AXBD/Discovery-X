// JSON-LD Graph 스키마 검증
import type { JsonLdGraph, JsonLdNode } from "./types";

// 허용되는 노드 @type 목록 (discovery-x.jsonld @context 기준)
const ALLOWED_NODE_TYPES = new Set([
  "dx:User",
  "dx:Topic",
  "dx:Decision",
  "dx:Signal",
  "dx:Glossary",
  "dx:Expertise",
  "dx:Preference",
  "mx:Industry",
  "mx:Function",
  "mx:Cell",
  "mx:Score",
]);

// @id 네이밍 규칙: dx:{type}/{uuid} 패턴 (type은 소문자)
const VALID_ID_PATTERN = /^(dx|mx):(user|topic|decision|signal|glossary|expertise|preference|industry|function|cell|score)\/[a-zA-Z0-9_.-]+$/;

// @type → @id prefix 매핑
const TYPE_TO_ID_PREFIX: Record<string, string> = {
  "dx:User": "dx:user/",
  "dx:Topic": "dx:topic/",
  "dx:Decision": "dx:decision/",
  "dx:Signal": "dx:signal/",
  "dx:Glossary": "dx:glossary/",
  "dx:Expertise": "dx:expertise/",
  "dx:Preference": "dx:preference/",
  "mx:Industry": "mx:industry/",
  "mx:Function": "mx:function/",
  "mx:Cell": "mx:cell/",
  "mx:Score": "mx:score/",
};

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/** JSON-LD 최상위 구조 검증 — 객체이며 @context, @graph가 존재하는지 */
export function validateJsonLd(jsonld: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof jsonld !== "object" || jsonld === null || Array.isArray(jsonld)) {
    errors.push("JSON-LD는 객체여야 합니다");
    return { valid: false, errors };
  }

  const obj = jsonld as Record<string, unknown>;

  if (!obj["@context"]) {
    errors.push("@context가 누락되었습니다");
  }

  if (!("@graph" in obj)) {
    errors.push("@graph가 누락되었습니다");
  } else if (!Array.isArray(obj["@graph"])) {
    errors.push("@graph는 배열이어야 합니다");
  }

  return { valid: errors.length === 0, errors };
}

/** @context 호환성 검증 — dx 네임스페이스가 정의되어 있는지 */
export function validateContext(jsonld: JsonLdGraph): ValidationResult {
  const errors: string[] = [];
  const ctx = jsonld["@context"];

  if (typeof ctx !== "object" || ctx === null) {
    errors.push("@context는 객체여야 합니다");
    return { valid: false, errors };
  }

  if (!ctx["dx"]) {
    errors.push("@context에 dx 네임스페이스가 정의되지 않았습니다");
  }

  return { valid: errors.length === 0, errors };
}

/** 노드 필수 필드 검증 — @id, @type 존재 및 @type 허용 목록 확인 */
export function validateNodes(nodes: JsonLdNode[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const prefix = `노드[${i}]`;

    if (!node["@id"]) {
      errors.push(`${prefix}: @id가 누락되었습니다`);
    }

    if (!node["@type"]) {
      errors.push(`${prefix}: @type이 누락되었습니다`);
    } else if (!ALLOWED_NODE_TYPES.has(node["@type"])) {
      errors.push(
        `${prefix}: 허용되지 않는 @type "${node["@type"]}" (허용: ${[...ALLOWED_NODE_TYPES].join(", ")})`,
      );
    }

    // @id 네이밍 규칙 검증 (dx:{type}/{id} 패턴 강제)
    if (node["@id"]) {
      if (!VALID_ID_PATTERN.test(node["@id"])) {
        errors.push(
          `${prefix}: @id "${node["@id"]}"는 {ns}:{type}/{id} 패턴을 따라야 합니다 (예: dx:user/abc-123, mx:cell/auto_ai)`,
        );
      } else if (node["@type"] && TYPE_TO_ID_PREFIX[node["@type"]]) {
        // @type과 @id prefix가 일치하는지 확인
        const expectedPrefix = TYPE_TO_ID_PREFIX[node["@type"]];
        if (!node["@id"].startsWith(expectedPrefix)) {
          errors.push(
            `${prefix}: @type "${node["@type"]}"에 대한 @id는 "${expectedPrefix}"로 시작해야 합니다 (현재: "${node["@id"]}")`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** 통합 검증 — validateJsonLd + validateContext + validateNodes */
export function validateGraph(jsonld: unknown): ValidationResult {
  const allErrors: string[] = [];

  // 1단계: 구조 검증
  const structResult = validateJsonLd(jsonld);
  allErrors.push(...structResult.errors);
  if (!structResult.valid) {
    return { valid: false, errors: allErrors };
  }

  const graph = jsonld as JsonLdGraph;

  // 2단계: 컨텍스트 검증
  const ctxResult = validateContext(graph);
  allErrors.push(...ctxResult.errors);

  // 3단계: 노드 검증 (빈 @graph도 허용)
  const allWarnings: string[] = [];
  if (graph["@graph"].length > 0) {
    const nodeResult = validateNodes(graph["@graph"]);
    allErrors.push(...nodeResult.errors);
    if (nodeResult.warnings) allWarnings.push(...nodeResult.warnings);
  }

  return { valid: allErrors.length === 0, errors: allErrors, warnings: allWarnings };
}
