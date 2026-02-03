/**
 * Venture 평가 기준 프리셋
 */

export interface VdEvaluationCriterion {
  id: string;
  label: string;
  weight: number; // 0-100
  description: string;
}

export interface VdEvaluationPreset {
  id: string;
  name: string;
  description: string;
  criteria: VdEvaluationCriterion[];
  killCriteria: string[];
}

/**
 * 기본 평가 기준: Tech Leadership / Branding
 */
export const VD_PRESET_TECH_LEADERSHIP_BRANDING: VdEvaluationPreset = {
  id: "tech_leadership_branding",
  name: "기술 리더십 & 브랜딩",
  description: "기술 차별화와 대외 메시지 임팩트 중심",
  criteria: [
    {
      id: "tech_differentiation",
      label: "기술 리더십/차별화",
      weight: 20,
      description: "기술적 우위 또는 차별화된 접근 방식",
    },
    {
      id: "strategic_fit",
      label: "전략 적합성",
      weight: 15,
      description: "조직 전략과의 정합성",
    },
    {
      id: "branding_impact",
      label: "브랜딩/대외 메시지 임팩트",
      weight: 10,
      description: "시장 인지도 및 브랜드 가치 기여도",
    },
    {
      id: "platform_reusability",
      label: "플랫폼화/재사용성",
      weight: 15,
      description: "다른 사업에 활용 가능한 플랫폼 요소",
    },
    {
      id: "pain_criticality",
      label: "Pain 본질성",
      weight: 15,
      description: "해결하려는 문제의 심각성과 빈도",
    },
    {
      id: "accessibility",
      label: "접근성/레퍼런스 현실성",
      weight: 10,
      description: "고객/시장 접근 용이성, 레퍼런스 확보 가능성",
    },
    {
      id: "option_value",
      label: "옵션 가치(중장기)",
      weight: 10,
      description: "향후 확장 또는 피봇 가능성",
    },
    {
      id: "risk",
      label: "리스크(규제/데이터/실행)",
      weight: 5,
      description: "실행 리스크 요소 (낮을수록 좋음)",
    },
  ],
  killCriteria: [
    "구매주체/예산 가설이 끝까지 비어 있음",
    '"우리가 이길 이유"가 근거 없이 주장뿐임',
    "데이터 접근 불가/규제 장벽이 구조적임",
  ],
};

/**
 * 대안 프리셋: Growth Focus
 */
export const VD_PRESET_GROWTH_FOCUS: VdEvaluationPreset = {
  id: "growth_focus",
  name: "성장 중심",
  description: "시장 규모와 성장 잠재력 중심",
  criteria: [
    {
      id: "market_size",
      label: "시장 규모",
      weight: 25,
      description: "TAM/SAM/SOM 관점의 시장 크기",
    },
    {
      id: "growth_rate",
      label: "성장률",
      weight: 20,
      description: "시장 성장률 및 트렌드",
    },
    {
      id: "competitive_position",
      label: "경쟁 포지션",
      weight: 15,
      description: "경쟁 환경에서의 포지셔닝",
    },
    {
      id: "revenue_potential",
      label: "매출 잠재력",
      weight: 20,
      description: "단기/중기 매출 기대치",
    },
    {
      id: "execution_speed",
      label: "실행 속도",
      weight: 10,
      description: "빠른 시장 진입 가능성",
    },
    {
      id: "risk",
      label: "리스크",
      weight: 10,
      description: "실행 리스크 요소",
    },
  ],
  killCriteria: [
    "시장 규모 측정 불가",
    "경쟁사 대비 명확한 우위 없음",
    "90일 내 첫 매출 불가능",
  ],
};

/**
 * 모든 프리셋 목록
 */
export const VD_EVALUATION_PRESETS: VdEvaluationPreset[] = [
  VD_PRESET_TECH_LEADERSHIP_BRANDING,
  VD_PRESET_GROWTH_FOCUS,
];

/**
 * 기본 프리셋 ID
 */
export const VD_DEFAULT_EVALUATION_PRESET_ID = "tech_leadership_branding";

/**
 * 프리셋 ID로 프리셋 조회
 */
export function getEvaluationPreset(presetId: string): VdEvaluationPreset | undefined {
  return VD_EVALUATION_PRESETS.find((p) => p.id === presetId);
}

/**
 * 가중치 합계 계산 (100이어야 함)
 */
export function validatePresetWeights(preset: VdEvaluationPreset): boolean {
  const total = preset.criteria.reduce((sum, c) => sum + c.weight, 0);
  return total === 100;
}
