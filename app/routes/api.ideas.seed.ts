import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "~/db";
import { radarSources, radarItems, radarRuns } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

/**
 * POST /api/ideas/seed — 디자인 기반 샘플 소스 데이터 시드
 * 한 번만 실행 가능 (중복 시 skip)
 */

const SAMPLE_SOURCES = [
  {
    url: "https://techcrunch.com/2025/12/ai-agent-market-2026-growth",
    title: "techcrunch.com/2025/12/ai-agent-market-2026-growth",
    titleKo: "AI 에이전트 시장, 2026년 300% 성장 전망",
    summaryKo: "기업용 AI 에이전트 시장이 급성장하며, 자율형 에이전트가 단순 챗봇을 넘어 업무 자동화의 핵심으로 부상하고 있다.",
    type: "web" as const,
  },
  {
    url: "https://www.nature.com/articles/wearable-robot-rehab-2026",
    title: "nature.com/articles/wearable-robot-rehab-2026",
    titleKo: "웨어러블 로봇의 재활 치료 효과: 임상시험 결과",
    summaryKo: "소프트 웨어러블 로봇이 뇌졸중 환자의 보행 재활에 유의미한 효과를 보였으며, 기존 물리치료 대비 회복 속도가 40% 향상되었다.",
    type: "web" as const,
  },
  {
    url: "https://www.youtube.com/watch?v=xr-smart-glass-demo-2026",
    title: "youtube.com/watch?v=xr-smart-glass-demo-2026",
    titleKo: "Apple Vision Pro 기업용 XR 전시 솔루션 데모",
    summaryKo: "스마트 글래스를 활용한 몰입형 전시 체험 시연. 박물관·갤러리에서 AR 가이드와 인터랙티브 전시를 결합한 사례.",
    type: "youtube" as const,
  },
  {
    url: "https://arxiv.org/abs/2026.01234-audit-ai-platform",
    title: "arxiv.org/abs/2026.01234-audit-ai-platform",
    titleKo: "대규모 언어 모델 기반 감사 자동화 플랫폼 설계",
    summaryKo: "LLM을 활용한 내부 감사 프로세스 자동화. 문서 분석, 이상 탐지, 보고서 생성을 통합한 AI 감사 플랫폼 아키텍처 제안.",
    type: "web" as const,
  },
  {
    url: "https://www.mckinsey.com/industries/healthcare/exoskeleton-market-2026",
    title: "mckinsey.com/industries/healthcare/exoskeleton-market-2026",
    titleKo: "외골격 로봇 시장 분석: 의료·산업·국방 3대 축",
    summaryKo: "글로벌 외골격 로봇 시장이 2028년까지 연평균 35% 성장 전망. 의료 재활, 산업 현장 근력 보조, 국방 분야가 핵심 성장 동력.",
    type: "web" as const,
  },
  {
    url: "https://hbr.org/2026/01/ai-agents-enterprise-adoption",
    title: "hbr.org/2026/01/ai-agents-enterprise-adoption",
    titleKo: "기업의 AI 에이전트 도입 전략: 단계별 접근법",
    summaryKo: "Fortune 500 기업의 AI 에이전트 도입 사례 분석. 파일럿에서 전사 확대까지의 3단계 프레임워크와 성공 요인.",
    type: "web" as const,
  },
  {
    url: "https://www.youtube.com/watch?v=immersive-exhibition-case",
    title: "youtube.com/watch?v=immersive-exhibition-case",
    titleKo: "MR 기반 몰입형 전시 '디지털 숲' 관람 후기",
    summaryKo: "혼합현실 기술로 구현한 디지털 아트 전시. 관람객 인터랙션 데이터를 실시간 반영하는 반응형 전시 사례.",
    type: "youtube" as const,
  },
  {
    url: "https://www.bloomberg.com/news/regtech-compliance-ai-2026",
    title: "bloomberg.com/news/regtech-compliance-ai-2026",
    titleKo: "RegTech AI: 금융 규제 준수 자동화의 새로운 패러다임",
    summaryKo: "AI 기반 규제 기술(RegTech)이 금융기관의 컴플라이언스 비용을 60% 절감. 실시간 규제 모니터링과 자동 보고 기능이 핵심.",
    type: "web" as const,
  },
  {
    url: "https://spectrum.ieee.org/soft-robotics-wearable-2026",
    title: "spectrum.ieee.org/soft-robotics-wearable-2026",
    titleKo: "소프트 로보틱스의 진화: 일상에서 입는 로봇",
    summaryKo: "유연한 소재 기반 소프트 로봇 기술이 발전하며 운동 보조, 자세 교정, 근력 지원용 웨어러블 로봇이 소비자 시장에 진입 중.",
    type: "web" as const,
  },
  {
    url: "https://venturebeat.com/2026/01/vr-art-gallery-platform-launch",
    title: "venturebeat.com/2026/01/vr-art-gallery-platform-launch",
    titleKo: "VR 아트 갤러리 플랫폼 출시: 전 세계 갤러리를 가상으로",
    summaryKo: "VR 기반 온라인 갤러리 플랫폼이 글로벌 론칭. 3D 스캔 기술로 실제 전시관을 가상 공간에 1:1 재현.",
    type: "web" as const,
  },
];

async function hashString(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find or create today's radar_run
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existingRun = await db
      .select({ id: radarRuns.id })
      .from(radarRuns)
      .where(
        and(
          eq(radarRuns.tenantId, ctx.tenantId),
          eq(radarRuns.status, "COMPLETED"),
          gte(radarRuns.startedAt, todayStart)
        )
      )
      .limit(1);

    let runId: string;
    if (existingRun.length > 0) {
      runId = existingRun[0].id;
    } else {
      runId = crypto.randomUUID();
      await db.insert(radarRuns).values({
        id: runId,
        tenantId: ctx.tenantId,
        status: "COMPLETED",
        sourcesChecked: SAMPLE_SOURCES.length,
        itemsCollected: SAMPLE_SOURCES.length,
      });
    }

    let created = 0;
    let skipped = 0;

    for (const src of SAMPLE_SOURCES) {
      const urlHash = await hashString(src.url);

      // Skip duplicates
      const existing = await db
        .select({ id: radarItems.id })
        .from(radarItems)
        .where(eq(radarItems.urlHash, urlHash))
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      const sourceId = crypto.randomUUID();
      const itemId = crypto.randomUUID();

      await db.insert(radarSources).values({
        id: sourceId,
        name: src.titleKo,
        sourceType: src.type,
        url: src.url,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
      });

      await db.insert(radarItems).values({
        id: itemId,
        sourceId,
        runId,
        urlHash,
        url: src.url,
        title: src.title,
        titleKo: src.titleKo,
        summaryKo: src.summaryKo,
        status: "COLLECTED",
      });

      created++;
    }

    return json({ created, skipped, total: SAMPLE_SOURCES.length });
  } catch (error) {
    console.error("[api.ideas.seed] Error:", error instanceof Error ? error.message : error);
    return json({ error: "시드 데이터 생성 실패" }, { status: 500 });
  }
}
