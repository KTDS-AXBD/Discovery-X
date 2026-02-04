/**
 * Venture Sprint 가이드 메시지 상수
 * 상태/탭별 다음 단계 안내 메시지
 */

import type { VdSprintStatusType } from "../types";

/** 가이드 메시지 구조 */
export interface GuideMessage {
  message: string;
  cta?: {
    label: string;
    /** 액션 타입: link(페이지 이동), scroll(스크롤), focus(입력 포커스) */
    action: "link" | "scroll" | "focus";
    /** link인 경우 이동할 경로 (상대 경로 지원) */
    href?: string;
  };
}

/** 상태별 가이드 설정 */
export interface StatusGuideConfig {
  title: string;
  description: string;
  /** 탭별 메시지 (키: 탭 이름 또는 "default") */
  tabs: Record<string, GuideMessage>;
}

/**
 * 컨텍스트별 기본 가이드 메시지
 */
export const CONTEXT_GUIDE_MESSAGES: Record<
  "overview" | "new-sprint",
  GuideMessage
> = {
  overview: {
    message: "새 스프린트를 생성하여 신사업 발굴을 시작하세요.",
    cta: {
      label: "새 스프린트",
      action: "link",
      href: "/venture/sprints/new",
    },
  },
  "new-sprint": {
    message:
      "스프린트를 생성하면 Day 0 준비 단계로 시작됩니다. 이름과 탐색 산업을 입력하세요.",
  },
};

/**
 * 스프린트 상태별 가이드 메시지
 */
export const SPRINT_GUIDE_MESSAGES: Record<VdSprintStatusType, StatusGuideConfig> = {
  DRAFT: {
    title: "Day 0: 준비",
    description: "탐색 범위를 선택하고 스프린트를 시작하세요",
    tabs: {
      default: {
        message: "탐색할 산업을 선택하고 '시작하기' 버튼을 클릭하세요.",
        cta: {
          label: "범위 선택",
          action: "scroll",
        },
      },
      inbox: {
        message: "스프린트를 시작해야 Signal 수집이 가능합니다. 먼저 개요 탭에서 시작하세요.",
        cta: {
          label: "개요로 이동",
          action: "link",
          href: "",
        },
      },
      longlist: {
        message: "스프린트를 시작해야 기회 카드를 작성할 수 있습니다.",
        cta: {
          label: "개요로 이동",
          action: "link",
          href: "",
        },
      },
    },
  },
  RUNNING: {
    title: "Day 1-2: Signal 수집",
    description: "관련 정보를 수집하고 기회 카드를 작성하세요",
    tabs: {
      default: {
        message: "Inbox에서 Signal을 확인하고 Long List에 기회 카드를 작성하세요.",
        cta: {
          label: "Inbox 보기",
          action: "link",
          href: "inbox",
        },
      },
      inbox: {
        message: "Signal과 Evidence를 확인하세요. 유망한 정보가 있다면 기회 카드로 전환하세요. (목표: 20개 이상 수집)",
        cta: {
          label: "Signal 추가",
          action: "focus",
        },
      },
      longlist: {
        message: "기회 카드를 6개 이상 작성하고 Gate 1을 준비하세요.",
        cta: {
          label: "카드 추가",
          action: "focus",
        },
      },
      gate: {
        message: "Long List에 기회 카드가 충분히 작성되면 Gate 1을 시작할 수 있습니다.",
        cta: {
          label: "Long List 보기",
          action: "link",
          href: "longlist",
        },
      },
      deepdive: {
        message: "아직 Gate 1 단계입니다. 먼저 Long List 작성 후 Gate 1을 통과하세요.",
      },
      packaging: {
        message: "아직 Gate 1 단계입니다. 순서대로 진행해주세요.",
      },
    },
  },
  GATE1_PENDING: {
    title: "Gate 1: Shortlist 선정",
    description: "Long List 중 유망한 기회를 선별하세요",
    tabs: {
      default: {
        message: "Gate 탭에서 Shortlist 선정을 위한 투표를 진행하세요.",
        cta: {
          label: "투표하기",
          action: "link",
          href: "gate",
        },
      },
      inbox: {
        message: "Gate 1 진행 중입니다. Gate 탭에서 투표를 완료하세요.",
        cta: {
          label: "Gate로 이동",
          action: "link",
          href: "gate",
        },
      },
      longlist: {
        message: "Gate 1 진행 중입니다. 투표 후 Shortlist가 결정됩니다.",
        cta: {
          label: "Gate로 이동",
          action: "link",
          href: "gate",
        },
      },
      gate: {
        message: "각 기회를 평가하고 Shortlist(최대 8개)를 선정하세요.",
        cta: {
          label: "투표 제출",
          action: "scroll",
        },
      },
      deepdive: {
        message: "Gate 1 통과 후 Deep Dive를 시작할 수 있습니다.",
      },
      packaging: {
        message: "Gate 1과 Gate 2를 통과해야 Packaging 단계로 진입합니다.",
      },
    },
  },
  DEEPDIVE: {
    title: "Day 3-4: Deep Dive",
    description: "Shortlist 기회에 대해 심층 분석을 수행하세요",
    tabs: {
      default: {
        message: "Deep Dive 탭에서 가정 검증, Pre-mortem, Lean Canvas를 작성하세요.",
        cta: {
          label: "Deep Dive 시작",
          action: "link",
          href: "deepdive",
        },
      },
      inbox: {
        message: "Deep Dive 단계입니다. 추가 Signal 수집보다 심층 분석에 집중하세요.",
        cta: {
          label: "Deep Dive로 이동",
          action: "link",
          href: "deepdive",
        },
      },
      longlist: {
        message: "Shortlist가 확정되었습니다. Deep Dive 분석을 진행하세요.",
        cta: {
          label: "Deep Dive로 이동",
          action: "link",
          href: "deepdive",
        },
      },
      gate: {
        message: "Gate 1이 완료되었습니다. Deep Dive 완료 후 Gate 2를 진행할 수 있습니다.",
      },
      deepdive: {
        message: "각 Shortlist 기회에 대해 Assumption, Pre-mortem, Lean Canvas를 작성하세요.",
        cta: {
          label: "분석 시작",
          action: "focus",
        },
      },
      packaging: {
        message: "Gate 2를 통과해야 Packaging 단계로 진입합니다.",
      },
    },
  },
  GATE2_PENDING: {
    title: "Gate 2: Final 선정",
    description: "Deep Dive 결과를 바탕으로 최종 기회를 선별하세요",
    tabs: {
      default: {
        message: "Gate 탭에서 Final 선정을 위한 재투표를 진행하세요.",
        cta: {
          label: "투표하기",
          action: "link",
          href: "gate",
        },
      },
      inbox: {
        message: "Gate 2 진행 중입니다. Gate 탭에서 최종 투표를 완료하세요.",
        cta: {
          label: "Gate로 이동",
          action: "link",
          href: "gate",
        },
      },
      longlist: {
        message: "Gate 2 진행 중입니다. Final 선정 후 Packaging을 시작합니다.",
        cta: {
          label: "Gate로 이동",
          action: "link",
          href: "gate",
        },
      },
      gate: {
        message: "Deep Dive 분석을 검토하고 Final(최대 3개)을 선정하세요.",
        cta: {
          label: "투표 제출",
          action: "scroll",
        },
      },
      deepdive: {
        message: "Gate 2 진행 중입니다. 추가 분석이 필요하면 여기서 보완하세요.",
      },
      packaging: {
        message: "Gate 2 통과 후 Packaging을 시작할 수 있습니다.",
      },
    },
  },
  PACKAGING: {
    title: "Day 5: Packaging",
    description: "최종 결과물을 완성하세요",
    tabs: {
      default: {
        message: "Packaging 탭에서 피치 덱과 요약 문서를 작성하세요.",
        cta: {
          label: "Packaging 시작",
          action: "link",
          href: "packaging",
        },
      },
      inbox: {
        message: "Packaging 단계입니다. 최종 문서 작성에 집중하세요.",
        cta: {
          label: "Packaging으로 이동",
          action: "link",
          href: "packaging",
        },
      },
      longlist: {
        message: "Final이 확정되었습니다. Packaging을 완료하세요.",
        cta: {
          label: "Packaging으로 이동",
          action: "link",
          href: "packaging",
        },
      },
      gate: {
        message: "모든 Gate가 완료되었습니다. Packaging을 진행하세요.",
        cta: {
          label: "Packaging으로 이동",
          action: "link",
          href: "packaging",
        },
      },
      deepdive: {
        message: "Deep Dive가 완료되었습니다. 결과를 Packaging에 반영하세요.",
        cta: {
          label: "Packaging으로 이동",
          action: "link",
          href: "packaging",
        },
      },
      packaging: {
        message: "피치 덱과 요약 문서를 완성하고 스프린트를 완료하세요.",
        cta: {
          label: "완료하기",
          action: "scroll",
        },
      },
    },
  },
  COMPLETED: {
    title: "스프린트 완료",
    description: "스프린트가 성공적으로 완료되었습니다",
    tabs: {
      default: {
        message: "스프린트가 완료되었습니다. 결과를 검토하거나 새 스프린트를 시작하세요.",
        cta: {
          label: "새 스프린트",
          action: "link",
          href: "/venture/sprints/new",
        },
      },
    },
  },
  ARCHIVED: {
    title: "아카이브",
    description: "이 스프린트는 아카이브되었습니다",
    tabs: {
      default: {
        message: "아카이브된 스프린트입니다. 읽기 전용으로 열람할 수 있습니다.",
      },
    },
  },
};

/**
 * 상태와 탭에 맞는 가이드 메시지 조회
 */
export function getGuideMessage(
  status: VdSprintStatusType,
  tab?: string
): GuideMessage {
  const config = SPRINT_GUIDE_MESSAGES[status];
  if (!config) {
    return { message: "스프린트를 진행하세요." };
  }

  // 탭별 메시지 우선, 없으면 default
  const tabKey = tab || "default";
  return config.tabs[tabKey] || config.tabs["default"] || { message: config.description };
}

/**
 * 상태 설정 전체 조회
 */
export function getStatusGuideConfig(status: VdSprintStatusType): StatusGuideConfig {
  return SPRINT_GUIDE_MESSAGES[status];
}
