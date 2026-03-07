/**
 * Discovery Management tool schemas
 * Discovery CRUD, 실험 추가/완료, 근거 추가 등 핵심 생명주기 도구
 */
import type { ClaudeTool } from "~/lib/ai";
import { ALL_STATUSES } from "~/lib/constants/status";

export const DISCOVERY_TOOLS: ClaudeTool[] = [
  // === Discovery Management ===
  {
    name: "create_discovery",
    description: "새 Discovery를 DISCOVERY 상태로 생성합니다. 생성 전 search_similar로 기존 Discovery와 중복 여부를 확인하세요.",
    input_schema: {
      type: "object",
      required: ["title", "seedSummary", "sourceType"],
      properties: {
        title: { type: "string", description: "Discovery 제목 (80자 이내)", maxLength: 80 },
        seedSummary: { type: "string", description: "Seed 요약 (400자 이내)", maxLength: 400 },
        seedLinks: { type: "array", items: { type: "string" }, description: "관련 링크 목록" },
        sourceType: {
          type: "string",
          enum: ["article", "issue", "internal_pain", "meeting_note", "other"],
          description: "소스 유형",
        },
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
          description: "산업 분류 코드 (선택). 지정 시 해당 산업의 규제/규칙이 자동 적용됩니다.",
        },
        candidateGroupId: {
          type: "string",
          description: "아이디어 후보 그룹 ID (generate_idea_candidates 결과, 선택)",
        },
      },
    },
  },
  {
    name: "update_discovery",
    description: "기존 Discovery의 제목, 요약, 링크, Reviewer를 수정합니다. DISCOVERY/IDEA_CARD 상태만 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        title: { type: "string", description: "새 제목 (80자 이내)", maxLength: 80 },
        seedSummary: { type: "string", description: "새 Seed 요약 (400자 이내)", maxLength: 400 },
        seedLinks: { type: "array", items: { type: "string" }, description: "새 관련 링크 목록" },
        reviewerId: { type: "string", description: "Reviewer 사용자 ID" },
      },
    },
  },
  {
    name: "promote_discovery",
    description: "DISCOVERY를 IDEA_CARD 상태로 승격합니다. Owner 지정 + 첫 실험 설계 필수. 호출 전 get_discovery_detail로 현재 상태를 확인하세요. 승격 시 28일 기한이 자동 설정됩니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "ownerId", "hypothesis", "minimalAction", "deadline", "expectedEvidence"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        ownerId: { type: "string", description: "Owner 사용자 ID" },
        hypothesis: { type: "string", description: "검증할 가설. 사용자가 제공한 문구를 그대로 사용", maxLength: 200 },
        minimalAction: { type: "string", description: "가설 검증을 위한 최소 행동", maxLength: 200 },
        deadline: { type: "string", description: "실험 기한 (ISO 8601 날짜)" },
        expectedEvidence: { type: "string", description: "예상 근거 (200자 이내)", maxLength: 200 },
      },
    },
  },
  {
    name: "transition_stage",
    description: "Discovery를 11단계 파이프라인 내 다른 단계로 전환합니다. 허용된 전환만 가능. HOLD/DROP 전환은 decide_hold/decide_drop 전용 도구 사용을 권장합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "toStatus"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        toStatus: {
          type: "string",
          enum: ALL_STATUSES,
          description: "전환할 목표 단계",
        },
        rationale: { type: "string", description: "전환 사유" },
      },
    },
  },
  {
    name: "add_experiment",
    description: "Discovery에 실험을 추가합니다 (최대 2개).",
    input_schema: {
      type: "object",
      required: ["discoveryId", "hypothesis", "minimalAction", "deadline", "expectedEvidence"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        hypothesis: { type: "string", description: "검증할 가설", maxLength: 200 },
        minimalAction: { type: "string", description: "가설 검증을 위한 최소 행동", maxLength: 200 },
        deadline: { type: "string", description: "실험 기한 (ISO 8601 날짜)" },
        expectedEvidence: { type: "string", description: "예상 근거", maxLength: 200 },
      },
    },
  },
  {
    name: "complete_experiment",
    description: "실험을 완료하고 결과를 기록합니다.",
    input_schema: {
      type: "object",
      required: ["experimentId", "resultSummary"],
      properties: {
        experimentId: { type: "string" },
        resultSummary: { type: "string", description: "결과 요약 (400자 이내)", maxLength: 400 },
      },
    },
  },
  {
    name: "add_evidence",
    description: "Discovery에 근거를 추가합니다. reliabilityLabel과 출처(sourceUrl 또는 linkOrAttachment) 중 하나 필수. content가 200자 미만이면 경고합니다. Gate 통과를 위해 publishedOrObservedDate 입력을 권장합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "type", "strength", "content", "reliabilityLabel"],
      properties: {
        discoveryId: { type: "string" },
        type: { type: "string", enum: ["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"] },
        strength: { type: "string", enum: ["A", "B", "C", "D"] },
        content: { type: "string", maxLength: 400 },
        reliabilityLabel: { type: "string", enum: ["confirmed", "reported", "hypothesis"], description: "신뢰도 라벨" },
        linkOrAttachment: { type: "string", description: "URL (선택)" },
        sourceUrl: { type: "string", description: "출처 URL (선택, linkOrAttachment와 중 하나 필수)" },
        publishedOrObservedDate: { type: "string", description: "발행/관측일 (YYYY-MM-DD, Gate 통과에 필요)" },
        experimentId: { type: "string", description: "연결할 실험 ID (선택)" },
      },
    },
  },
];
