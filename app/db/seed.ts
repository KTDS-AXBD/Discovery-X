import { getDb, users, discoveries, DiscoveryStatus, SourceType, industryAdapters, industryRules } from "./index";

export async function seedDatabase(db: ReturnType<typeof getDb>) {
  // 5명의 테스트 사용자 생성
  const testUsers = [
    { id: "user-1", email: "owner1@ax.com", name: "김탐험" },
    { id: "user-2", email: "owner2@ax.com", name: "이실험" },
    { id: "user-3", email: "owner3@ax.com", name: "박근거" },
    { id: "user-4", email: "reviewer@ax.com", name: "최검토" },
    { id: "user-5", email: "curator@ax.com", name: "정큐레이터" },
  ];

  console.log("Creating test users...");
  for (const user of testUsers) {
    await db.insert(users).values(user).onConflictDoNothing();
  }

  // 샘플 Discovery 생성
  const sampleDiscoveries = [
    {
      id: "discovery-1",
      title: "GPT 기반 내부 문서 검색 시스템",
      seedSummary:
        "직원들이 Confluence/Notion에서 원하는 정보를 찾는데 평균 15분 소요. RAG 기반 검색으로 3분 이내 단축 가능할 것으로 보임.",
      seedLinks: [
        "https://example.com/confluence-usage-data",
        "https://example.com/rag-benchmark",
      ],
      sourceType: SourceType.INTERNAL_PAIN,
      status: DiscoveryStatus.DISCOVERY,
    },
    {
      id: "discovery-2",
      title: "B2B SaaS 고객 이탈 예측 모델",
      seedSummary:
        "현재 이탈 고객의 70%가 마지막 30일간 로그인 <3회. 행동 데이터 기반 7일 전 조기 경고 시스템 구축 가능.",
      seedLinks: ["https://example.com/churn-analysis"],
      sourceType: SourceType.ARTICLE,
      status: DiscoveryStatus.DISCOVERY,
    },
  ];

  console.log("Creating sample discoveries...");
  for (const discovery of sampleDiscoveries) {
    await db.insert(discoveries).values(discovery).onConflictDoNothing();
  }

  // Industry Adapter 시드 (Strategic Evolution F1)
  const industryAdaptersSeed = [
    {
      id: "ind_manufacturing",
      code: "manufacturing",
      nameKo: "제조업",
      description: "제조업 분야 Discovery에 적용되는 산업 어댑터",
      icon: "🏭",
      color: "#F59E0B",
      regulatoryFramework: ["산업안전보건법", "품질경영시스템(ISO 9001)", "환경규제"],
      complianceRequirements: ["안전인증", "품질관리기준"],
      defaultTimeboxDays: 28,
      evidenceWeightModifiers: { A: 1.0, B: 0.9, C: 0.7, D: 0.4 },
    },
    {
      id: "ind_finance",
      code: "finance",
      nameKo: "금융/보험",
      description: "금융·보험 분야 Discovery에 적용되는 산업 어댑터",
      icon: "🏦",
      color: "#3B82F6",
      regulatoryFramework: ["금융소비자보호법", "개인정보보호법", "전자금융거래법"],
      complianceRequirements: ["KYC", "AML", "정보보호관리체계(ISMS)"],
      defaultTimeboxDays: 21,
      evidenceWeightModifiers: { A: 1.0, B: 0.8, C: 0.5, D: 0.2 },
    },
    {
      id: "ind_healthcare",
      code: "healthcare",
      nameKo: "헬스케어/의료",
      description: "헬스케어·의료 분야 Discovery에 적용되는 산업 어댑터",
      icon: "🏥",
      color: "#10B981",
      regulatoryFramework: ["의료법", "약사법", "의료기기법"],
      complianceRequirements: ["GMP", "HIPAA 준용", "IRB 승인"],
      defaultTimeboxDays: 35,
      evidenceWeightModifiers: { A: 1.0, B: 0.85, C: 0.6, D: 0.3 },
    },
    {
      id: "ind_public",
      code: "public",
      nameKo: "공공/정부",
      description: "공공·정부 분야 Discovery에 적용되는 산업 어댑터",
      icon: "🏛️",
      color: "#8B5CF6",
      regulatoryFramework: ["국가계약법", "정보공개법", "공공기관운영법"],
      complianceRequirements: ["국정감사 대응", "보안성 검토", "정보보호 영향평가"],
      defaultTimeboxDays: 42,
      evidenceWeightModifiers: { A: 1.0, B: 0.9, C: 0.65, D: 0.3 },
    },
    {
      id: "ind_energy",
      code: "energy",
      nameKo: "에너지/환경",
      description: "에너지·환경 분야 Discovery에 적용되는 산업 어댑터",
      icon: "⚡",
      color: "#EF4444",
      regulatoryFramework: ["전기사업법", "환경영향평가법", "RE100"],
      complianceRequirements: ["환경영향평가", "탄소배출 보고"],
      defaultTimeboxDays: 28,
      evidenceWeightModifiers: { A: 1.0, B: 0.9, C: 0.7, D: 0.4 },
    },
  ];

  console.log("Creating industry adapters...");
  for (const adapter of industryAdaptersSeed) {
    await db.insert(industryAdapters).values(adapter).onConflictDoNothing();
  }

  // Industry Rules 시드 (산업별 기본 규칙)
  const industryRulesSeed = [
    // 금융 규칙
    {
      id: "rule_fin_kyc",
      industryAdapterId: "ind_finance",
      ruleType: "validation",
      nameKo: "KYC 관련 근거 필수",
      condition: { stage: ["EVIDENCE_REVIEW", "GATE1"], requireEvidence: { tag: "kyc", minCount: 1 } },
      action: { type: "warning", message: "금융 Discovery는 KYC 관련 근거가 최소 1개 필요합니다." },
    },
    {
      id: "rule_fin_risk",
      industryAdapterId: "ind_finance",
      ruleType: "method_recommendation",
      nameKo: "리스크 평가 Method 권장",
      condition: { stage: ["HYPOTHESIS", "EXPERIMENT"] },
      action: { type: "recommend", methodPackId: "mp_risk_matrix", message: "금융 Discovery에는 리스크 평가 Method 실행을 권장합니다." },
    },
    {
      id: "rule_fin_isms",
      industryAdapterId: "ind_finance",
      ruleType: "gate_criteria",
      nameKo: "ISMS 보안 검토 필수",
      condition: { gateType: "GATE1" },
      action: { type: "require", checklist: ["정보보호 영향평가 완료", "개인정보 처리 방침 확인"] },
    },
    // 헬스케어 규칙
    {
      id: "rule_hc_irb",
      industryAdapterId: "ind_healthcare",
      ruleType: "validation",
      nameKo: "IRB 승인 확인",
      condition: { stage: ["EXPERIMENT"], involveHumanSubject: true },
      action: { type: "block", message: "인체 대상 실험은 IRB 승인이 필수입니다." },
    },
    {
      id: "rule_hc_evidence",
      industryAdapterId: "ind_healthcare",
      ruleType: "scoring",
      nameKo: "의료 근거 강도 기준 강화",
      condition: { stage: ["EVIDENCE_REVIEW"] },
      action: { type: "adjust_weights", modifiers: { A: 1.0, B: 0.7, C: 0.4, D: 0.1 } },
    },
    // 공공 규칙
    {
      id: "rule_pub_audit",
      industryAdapterId: "ind_public",
      ruleType: "gate_criteria",
      nameKo: "국정감사 증적 확보",
      condition: { gateType: "GATE2" },
      action: { type: "require", checklist: ["감사 추적 보고서 생성", "근거 패키지 준비", "예산 집행 증빙"] },
    },
    {
      id: "rule_pub_security",
      industryAdapterId: "ind_public",
      ruleType: "validation",
      nameKo: "보안성 검토 필수",
      condition: { stage: ["GATE1", "GATE2"] },
      action: { type: "warning", message: "공공 분야 Discovery는 보안성 검토가 필수입니다." },
    },
    // 제조 규칙
    {
      id: "rule_mfg_safety",
      industryAdapterId: "ind_manufacturing",
      ruleType: "validation",
      nameKo: "산업안전 검토",
      condition: { stage: ["EXPERIMENT"] },
      action: { type: "warning", message: "실험 단계에서 산업안전 리스크를 평가해주세요." },
    },
    // 에너지 규칙
    {
      id: "rule_eng_env",
      industryAdapterId: "ind_energy",
      ruleType: "gate_criteria",
      nameKo: "환경영향평가 확인",
      condition: { gateType: "GATE1" },
      action: { type: "require", checklist: ["환경영향평가 검토", "탄소배출 영향 분석"] },
    },
  ];

  console.log("Creating industry rules...");
  for (const rule of industryRulesSeed) {
    await db.insert(industryRules).values(rule).onConflictDoNothing();
  }

  console.log("✅ Seed data created successfully!");
  console.log(`- Users: ${testUsers.length}`);
  console.log(`- Discoveries: ${sampleDiscoveries.length}`);
  console.log(`- Industry Adapters: ${industryAdaptersSeed.length}`);
  console.log(`- Industry Rules: ${industryRulesSeed.length}`);
}
