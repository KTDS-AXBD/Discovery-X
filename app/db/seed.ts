import { getDb, users, discoveries, DiscoveryStatus, SourceType } from "./index";

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
      status: DiscoveryStatus.INBOX,
    },
    {
      id: "discovery-2",
      title: "B2B SaaS 고객 이탈 예측 모델",
      seedSummary:
        "현재 이탈 고객의 70%가 마지막 30일간 로그인 <3회. 행동 데이터 기반 7일 전 조기 경고 시스템 구축 가능.",
      seedLinks: ["https://example.com/churn-analysis"],
      sourceType: SourceType.ARTICLE,
      status: DiscoveryStatus.INBOX,
    },
  ];

  console.log("Creating sample discoveries...");
  for (const discovery of sampleDiscoveries) {
    await db.insert(discoveries).values(discovery).onConflictDoNothing();
  }

  console.log("✅ Seed data created successfully!");
  console.log(`- Users: ${testUsers.length}`);
  console.log(`- Discoveries: ${sampleDiscoveries.length}`);
}
