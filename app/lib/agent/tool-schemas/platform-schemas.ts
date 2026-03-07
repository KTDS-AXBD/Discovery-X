/**
 * Platform tool schemas
 * KPI 지표(Indicator), Discovery 연결(Connector), Gate 승인(Governance), 알림(Alert) 도구
 */
import type { ClaudeTool } from "~/lib/ai";

export const PLATFORM_TOOLS: ClaudeTool[] = [
  // === Indicator Tools (v3 R3) ===
  {
    name: "register_kpi",
    description: "Discovery에 KPI(선행지표)를 등록합니다 (최대 5개). Method Pack 연결 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "name", "unit"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        name: { type: "string", description: "KPI 이름 (예: 사용자 전환율, 응답 시간)" },
        unit: { type: "string", description: "단위 (예: %, ms, 건)" },
        targetValue: { type: "number", description: "목표값 (선택)" },
        warningThreshold: { type: "number", description: "경고 임계치 (선택)" },
        criticalThreshold: { type: "number", description: "위험 임계치 (선택)" },
        direction: {
          type: "string",
          enum: ["higher_is_better", "lower_is_better"],
          description: "방향성 (기본: higher_is_better)",
        },
        methodPackId: { type: "string", description: "연결할 Method Pack ID (선택)" },
      },
    },
  },
  {
    name: "record_kpi_measurement",
    description: "KPI 측정값을 기록합니다. 임계치 위반 시 경고를 반환합니다.",
    input_schema: {
      type: "object",
      required: ["kpiId", "value"],
      properties: {
        kpiId: { type: "string", description: "KPI ID" },
        value: { type: "number", description: "측정값" },
        note: { type: "string", description: "측정 메모 (선택)" },
        measuredAt: { type: "string", description: "측정 시점 (ISO 8601, 기본: 현재)" },
      },
    },
  },
  {
    name: "get_kpi_status",
    description: "Discovery의 KPI 현황을 조회합니다. 최근 10개 측정값, 임계치 상태, 트렌드 포함.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },
  {
    name: "get_pipeline_health",
    description: "시스템 전체 파이프라인 건강지표를 조회합니다. 단계별 체류시간, 전환율, 근거 품질, 기한 초과 등.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  // === Connector Tools (v3 R3) ===
  {
    name: "link_discoveries",
    description: "두 Discovery를 관계로 연결합니다. similar/alternative는 양방향 자동 생성.",
    input_schema: {
      type: "object",
      required: ["fromDiscoveryId", "toDiscoveryId", "linkType"],
      properties: {
        fromDiscoveryId: { type: "string", description: "출발 Discovery ID" },
        toDiscoveryId: { type: "string", description: "도착 Discovery ID" },
        linkType: {
          type: "string",
          enum: ["predecessor", "successor", "similar", "alternative"],
          description: "관계 유형",
        },
        note: { type: "string", description: "관계 설명 (선택)" },
      },
    },
  },
  {
    name: "get_linked_discoveries",
    description: "Discovery에 연결된 다른 Discovery 목록을 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },

  // === Governance Tools (v3 R3) ===
  {
    name: "request_gate_approval",
    description: "Gate 패키지에 대해 리뷰어에게 승인 요청을 생성합니다. SLA 기한 설정 가능.",
    input_schema: {
      type: "object",
      required: ["gatePackageId", "reviewerIds"],
      properties: {
        gatePackageId: { type: "string", description: "Gate 패키지 ID" },
        reviewerIds: {
          type: "array",
          items: { type: "string" },
          description: "리뷰어 사용자 ID 목록",
        },
        slaDeadlineDays: { type: "number", description: "SLA 기한 (일, 선택)" },
      },
    },
  },
  {
    name: "submit_gate_approval",
    description: "Gate 승인 요청에 대해 승인/거부/조건부 결정을 제출합니다.",
    input_schema: {
      type: "object",
      required: ["approvalId", "decision"],
      properties: {
        approvalId: { type: "string", description: "승인 요청 ID" },
        decision: {
          type: "string",
          enum: ["APPROVED", "REJECTED", "CONDITIONAL"],
          description: "결정",
        },
        comment: { type: "string", description: "코멘트 (선택)" },
      },
    },
  },

  // === Alert Tools (v3 R3b) ===
  {
    name: "get_alerts",
    description: "알림 목록을 조회합니다. severity(info/warning/critical)와 acknowledged 상태로 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
          description: "심각도 필터 (선택)",
        },
        acknowledged: {
          type: "boolean",
          description: "확인 여부 필터 (선택, false=미확인만)",
        },
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
      },
    },
  },
  {
    name: "acknowledge_alert",
    description: "알림을 확인(acknowledge) 처리합니다.",
    input_schema: {
      type: "object",
      required: ["alertId"],
      properties: {
        alertId: { type: "string", description: "알림 ID" },
        userId: { type: "string", description: "확인자 사용자 ID (선택)" },
      },
    },
  },
  {
    name: "manage_webhook",
    description: "웹훅 설정을 관리합니다 (생성/수정/삭제/목록). Slack, Teams, Custom 지원.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["create", "update", "delete", "list"],
          description: "수행할 작업",
        },
        webhookId: { type: "string", description: "웹훅 ID (update/delete 시 필수)" },
        name: { type: "string", description: "웹훅 이름 (create 시 필수)" },
        url: { type: "string", description: "웹훅 URL (create 시 필수)" },
        platform: {
          type: "string",
          enum: ["slack", "teams", "custom"],
          description: "플랫폼 (기본: custom)",
        },
        events: {
          type: "array",
          items: { type: "string" },
          description: "구독 이벤트 타입 (예: ['kpi_threshold', 'overdue'], 기본: ['*'])",
        },
        headers: {
          type: "object",
          description: "커스텀 헤더 (선택)",
        },
        enabled: { type: "boolean", description: "활성화 여부 (기본: true)" },
      },
    },
  },
];
