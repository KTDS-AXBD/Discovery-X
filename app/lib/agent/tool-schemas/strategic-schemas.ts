/**
 * Strategic Evolution tool schemas
 * 산업 어댑터(Industry), 의사결정 자산(Asset), 규제 준수(Compliance), 멀티 테넌트 도구
 */
import type { ClaudeTool } from "~/lib/ai";

export const STRATEGIC_TOOLS: ClaudeTool[] = [
  // === Industry Adapter Tools (Strategic Evolution F1) ===
  {
    name: "get_industry_context",
    description: "특정 산업의 규제 환경, 준수 사항, 적용 가능한 규칙을 조회합니다.",
    input_schema: {
      type: "object",
      required: ["industryCode"],
      properties: {
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy"],
          description: "산업 분류 코드",
        },
        includeRules: { type: "boolean", description: "규칙 목록 포함 여부 (기본: true)" },
      },
    },
  },

  // === Asset Tools (Strategic Evolution F3) ===
  {
    name: "extract_decision_pattern",
    description: "특정 Discovery의 의사결정 패턴을 분석하고 재사용 가능한 규칙으로 추출합니다. decision_logs에 축적된 로그를 기반으로 성공/실패 패턴을 식별합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        patternType: {
          type: "string",
          enum: ["success", "failure", "decision", "workflow"],
          description: "추출할 패턴 유형 (선택)",
        },
        minConfidence: {
          type: "integer",
          description: "최소 신뢰도 기준 (0~100, 기본 70)",
        },
      },
    },
  },
  {
    name: "apply_reusable_rule",
    description: "재사용 가능한 규칙을 현재 Discovery에 적용합니다. 기본 dry run 모드로 적용 가능 여부만 확인합니다.",
    input_schema: {
      type: "object",
      required: ["ruleId", "discoveryId"],
      properties: {
        ruleId: { type: "string", description: "재사용 규칙 ID" },
        discoveryId: { type: "string", description: "Discovery ID" },
        dryRun: { type: "boolean", description: "테스트 실행 여부 (기본: true)" },
      },
    },
  },

  // === Compliance Tools (Strategic Evolution F5) ===
  {
    name: "generate_audit_trail",
    description: "특정 Discovery의 전체 감사 추적 보고서를 생성합니다. 모든 상태 변경, 의사결정, 근거를 타임라인으로 정리합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        format: {
          type: "string",
          enum: ["json", "markdown", "html"],
          description: "출력 형식 (기본: markdown)",
        },
        dateRange: {
          type: "object",
          properties: {
            from: { type: "string", description: "시작 날짜 (YYYY-MM-DD)" },
            to: { type: "string", description: "종료 날짜 (YYYY-MM-DD)" },
          },
          description: "날짜 범위 필터 (선택)",
        },
        includeConversations: { type: "boolean", description: "대화 내용 포함 여부 (기본: false)" },
      },
    },
  },
  {
    name: "check_regulatory_compliance",
    description: "Discovery가 해당 산업의 규제 요건을 충족하는지 검증합니다. 산업 어댑터가 지정된 경우에만 의미 있는 결과를 반환합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        checklistOnly: { type: "boolean", description: "체크리스트만 반환 (기본: false)" },
        autoFix: { type: "boolean", description: "자동 수정 시도 (기본: false)" },
      },
    },
  },
  {
    name: "package_evidence_for_audit",
    description: "감사 대응을 위한 근거 패키지를 생성합니다. 관련 Evidence, 첨부파일, 타임라인을 종합합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        auditType: {
          type: "string",
          enum: ["internal", "external", "regulatory", "national_assembly"],
          description: "감사 유형 (기본: internal)",
        },
        includeAttachments: { type: "boolean", description: "첨부파일 목록 포함 (기본: true)" },
        includeTimeline: { type: "boolean", description: "이벤트 타임라인 포함 (기본: true)" },
      },
    },
  },
  {
    name: "format_compliance_report",
    description: "규제 준수 보고서를 표준 양식으로 포맷팅합니다. Executive Summary, 상세 감사, Gate 리뷰, 체크리스트 유형을 지원합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "reportType"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        reportType: {
          type: "string",
          enum: ["executive_summary", "detailed_audit", "gate_review", "compliance_checklist"],
          description: "보고서 유형",
        },
        outputFormat: {
          type: "string",
          enum: ["markdown", "html", "pdf_template"],
          description: "출력 형식 (기본: markdown)",
        },
        language: {
          type: "string",
          enum: ["ko", "en"],
          description: "언어 (기본: ko)",
        },
      },
    },
  },

  // === Multi-Tenant Tools (F6) ===
  {
    name: "get_tenant_info",
    description: "현재 조직 정보를 조회합니다. 멤버 목록, 설정, 사용량을 확인합니다.",
    input_schema: {
      type: "object",
      properties: {
        includeMembers: { type: "boolean", description: "멤버 목록 포함 (기본: true)" },
        includeUsage: { type: "boolean", description: "사용량 통계 포함 (기본: false)" },
      },
    },
  },
  {
    name: "manage_tenant_members",
    description: "조직 멤버를 관리합니다. 초대, 역할 변경, 제거 작업을 수행합니다.",
    input_schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ["invite", "update_role", "remove"],
          description: "수행할 작업",
        },
        userEmail: { type: "string", description: "대상 사용자 이메일 (invite)" },
        userId: { type: "string", description: "대상 사용자 ID (update_role/remove)" },
        role: {
          type: "string",
          enum: ["admin", "gatekeeper", "member", "viewer"],
          description: "부여할 역할 (invite/update_role)",
        },
      },
    },
  },
];
