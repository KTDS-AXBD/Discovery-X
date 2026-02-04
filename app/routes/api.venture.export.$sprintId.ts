/**
 * Venture Sprint Export API
 * GET /api/venture/export/:sprintId
 *
 * Final 기회와 산출물을 Markdown 파일로 다운로드
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  listArtifactsByOpportunity,
} from "~/features/venture/repositories/opportunity.repository";
import { sprintToMarkdown } from "~/features/venture/lib/markdown-exporter";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sprintId } = params;
  if (!sprintId) {
    return json({ error: "Sprint ID required" }, { status: 400 });
  }

  // 스프린트 조회
  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    return json({ error: "Sprint not found" }, { status: 404 });
  }

  // URL 파라미터 파싱
  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "markdown";
  const includeMetadata = url.searchParams.get("metadata") !== "false";
  const includeTimestamps = url.searchParams.get("timestamps") !== "false";
  const finalOnly = url.searchParams.get("finalOnly") !== "false";

  // Final 기회 조회 (기본) 또는 전체 기회
  const opportunities = await listOpportunitiesBySprint(
    db,
    sprintId,
    finalOnly ? { finalOnly: true } : undefined
  );

  // 각 기회별 산출물 로드
  const opportunitiesWithArtifacts = await Promise.all(
    opportunities.map(async (opp) => {
      const artifacts = await listArtifactsByOpportunity(db, opp.id);
      return {
        opportunity: opp,
        artifacts,
      };
    })
  );

  // Markdown 변환
  if (format === "markdown" || format === "md") {
    const markdown = sprintToMarkdown(
      {
        sprint,
        opportunities: opportunitiesWithArtifacts,
      },
      {
        includeMetadata,
        includeTimestamps,
      }
    );

    // 파일명 생성 (스프린트 이름에서 안전하지 않은 문자 제거)
    const safeName = sprint.name
      .replace(/[^a-zA-Z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    const filename = `${safeName}_${new Date().toISOString().split("T")[0]}.md`;

    return new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  }

  // JSON 형식
  if (format === "json") {
    const data = {
      sprint,
      opportunities: opportunitiesWithArtifacts,
      exportedAt: new Date().toISOString(),
    };

    const safeName = sprint.name
      .replace(/[^a-zA-Z0-9가-힣\s-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50);
    const filename = `${safeName}_${new Date().toISOString().split("T")[0]}.json`;

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  }

  return json({ error: "Unsupported format. Use 'markdown' or 'json'" }, { status: 400 });
}
