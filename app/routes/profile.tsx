/**
 * /profile — 사용자 프로필 (JSON-LD Graph) 편집 페이지
 *
 * - 좌측: 기본 정보 / 전문 분야 / 관심 분야 편집
 * - 우측: USER.md Projection 미리보기
 */

import { useState, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";
import { ProjectionBuilder } from "~/lib/graph/projection";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";
import { AppShell } from "~/components/layout/AppShell";
import { ProfileEditor } from "~/features/profile/ui/ProfileEditor";
import { AgentSettingsEditor } from "~/features/profile/ui/AgentSettingsEditor";
import { ProjectionPreview } from "~/features/profile/ui/ProjectionPreview";

// ─── 유틸 ──────────────────────────────────────────────────────────────

function str(node: JsonLdNode, key: string, fallback = ""): string {
  const v = node[key];
  return typeof v === "string" ? v : fallback;
}

function makeEmptyGraph(userId: string, userName: string): JsonLdGraph {
  return {
    "@context": { dx: "https://discovery-x.ax/ns/" },
    "@graph": [
      {
        "@id": `user:${userId}`,
        "@type": "dx:User",
        "dx:name": userName,
        "dx:role": "",
      },
    ],
  };
}

function groupNodesByType(nodes: JsonLdNode[]): Map<string, JsonLdNode[]> {
  const map = new Map<string, JsonLdNode[]>();
  for (const node of nodes) {
    const type = node["@type"];
    const list = map.get(type) ?? [];
    list.push(node);
    map.set(type, list);
  }
  return map;
}

// ─── Loader ─────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const store = new GraphStore(db);
  const scopeId = String(user.id);
  const graph = await store.getByScopeId("user", scopeId);

  const builder = new ProjectionBuilder(db);
  const projection = await builder.getProjection("user", scopeId, "USER.md");

  // Agent 설정 추출
  const graphNodes = graph?.jsonld?.["@graph"] ?? [];
  const agentSettingsNode = graphNodes.find(
    (n: import("~/lib/graph/types").JsonLdNode) => n["@type"] === "dx:AgentSettings",
  );
  const agentSettings = agentSettingsNode
    ? {
        language: String(agentSettingsNode["dx:language"] ?? "auto"),
        style: String(agentSettingsNode["dx:style"] ?? "concise"),
        customInstructions: String(agentSettingsNode["dx:customInstructions"] ?? ""),
      }
    : { language: "auto", style: "concise", customInstructions: "" };

  return json({
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role ?? undefined,
    },
    onboardingCompleted: user.onboardingCompleted === 1,
    graph: graph
      ? {
          id: graph.id,
          jsonld: graph.jsonld,
          version: graph.version,
          contentHash: graph.contentHash,
        }
      : null,
    projection: projection?.content ?? null,
    projectionMeta: projection
      ? {
          graphVersion: projection.graphVersion,
          sourceHash: projection.sourceHash,
          generatedAt: projection.generatedAt
            ? new Date(projection.generatedAt).toISOString()
            : null,
        }
      : null,
    agentSettings,
  });
}

// ─── Action ─────────────────────────────────────────────────────────────

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const store = new GraphStore(db);
  const builder = new ProjectionBuilder(db);
  const scopeId = String(user.id);
  const audit = { actorId: user.id, actorType: "user" as const };
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // 현재 그래프 로드 (없으면 빈 그래프 생성)
  let graphRecord = await store.getByScopeId("user", scopeId);
  if (!graphRecord) {
    graphRecord = await store.create({
      scopeType: "user",
      scopeId,
      jsonld: makeEmptyGraph(user.id, user.name),
      contentHash: "",
    }, audit);
  }

  const jsonld = graphRecord.jsonld;
  const graphNodes = jsonld["@graph"];

  switch (intent) {
    case "update-profile": {
      const name = (formData.get("name") as string) ?? "";
      const role = (formData.get("role") as string) ?? "";

      // User 노드 업데이트
      const userNode = graphNodes.find((n) => n["@type"] === "dx:User");
      if (userNode) {
        userNode["dx:name"] = name;
        userNode["dx:role"] = role;
      }

      await store.update(graphRecord.id, jsonld, "프로필 기본 정보 업데이트", audit);
      await builder.syncProjection("user", scopeId);
      break;
    }

    case "add-expertise": {
      const label = (formData.get("label") as string)?.trim();
      const level = (formData.get("level") as string) ?? "mid";
      if (!label) break;

      const nodeId = `exp:${Date.now()}`;
      graphNodes.push({
        "@id": nodeId,
        "@type": "dx:Expertise",
        "dx:label": label,
        "dx:level": level,
      });

      await store.update(graphRecord.id, jsonld, `전문 분야 추가: ${label}`, audit);
      await builder.syncProjection("user", scopeId);
      break;
    }

    case "remove-expertise": {
      const nodeId = formData.get("nodeId") as string;
      if (!nodeId) break;

      jsonld["@graph"] = graphNodes.filter((n) => n["@id"] !== nodeId);

      await store.update(graphRecord.id, jsonld, `전문 분야 제거: ${nodeId}`, audit);
      await builder.syncProjection("user", scopeId);
      break;
    }

    case "add-preference": {
      const label = (formData.get("label") as string)?.trim();
      if (!label) break;

      const nodeId = `pref:${Date.now()}`;
      graphNodes.push({
        "@id": nodeId,
        "@type": "dx:Preference",
        "dx:label": label,
      });

      await store.update(graphRecord.id, jsonld, `관심 분야 추가: ${label}`, audit);
      await builder.syncProjection("user", scopeId);
      break;
    }

    case "remove-preference": {
      const nodeId = formData.get("nodeId") as string;
      if (!nodeId) break;

      jsonld["@graph"] = graphNodes.filter((n) => n["@id"] !== nodeId);

      await store.update(graphRecord.id, jsonld, `관심 분야 제거: ${nodeId}`, audit);
      await builder.syncProjection("user", scopeId);
      break;
    }

    case "update-agent-settings": {
      const language = (formData.get("agentLanguage") as string) ?? "auto";
      const style = (formData.get("agentStyle") as string) ?? "concise";
      const customInstructions = (formData.get("customInstructions") as string)?.slice(0, 500) ?? "";

      // dx:AgentSettings 노드 찾기 또는 생성
      const settingsIdx = graphNodes.findIndex((n) => n["@type"] === "dx:AgentSettings");
      const settingsNode: import("~/lib/graph/types").JsonLdNode = {
        "@id": "agent-settings:default",
        "@type": "dx:AgentSettings",
        "dx:language": language,
        "dx:style": style,
        "dx:customInstructions": customInstructions,
      };

      if (settingsIdx >= 0) {
        graphNodes[settingsIdx] = settingsNode;
      } else {
        graphNodes.push(settingsNode);
      }

      await store.update(graphRecord.id, jsonld, "Agent 설정 업데이트", audit);
      await builder.syncProjection("user", scopeId);
      break;
    }

    case "sync-projection": {
      await builder.syncProjection("user", scopeId);
      break;
    }
  }

  // 최신 상태를 다시 조회해서 반환
  const updatedGraph = await store.getByScopeId("user", scopeId);
  const updatedProjection = await builder.getProjection("user", scopeId, "USER.md");

  return json({
    ok: true,
    graph: updatedGraph
      ? {
          id: updatedGraph.id,
          jsonld: updatedGraph.jsonld,
          version: updatedGraph.version,
          contentHash: updatedGraph.contentHash,
        }
      : null,
    projection: updatedProjection?.content ?? null,
    projectionMeta: updatedProjection
      ? {
          graphVersion: updatedProjection.graphVersion,
          sourceHash: updatedProjection.sourceHash,
          generatedAt: updatedProjection.generatedAt
            ? new Date(updatedProjection.generatedAt).toISOString()
            : null,
        }
      : null,
  });
}

// ─── 컴포넌트 ──────────────────────────────────────────────────────────

export default function Profile() {
  const data = useLoaderData<typeof loader>();
  const [syncing, setSyncing] = useState(false);
  const [projContent, setProjContent] = useState(data.projection);
  const [projMeta, setProjMeta] = useState(data.projectionMeta);

  // JSON-LD 그래프에서 노드 추출
  const graphNodes = data.graph?.jsonld?.["@graph"] ?? [];
  const grouped = groupNodesByType(graphNodes);

  const userNodes = grouped.get("dx:User") ?? [];
  const userNode = userNodes[0];
  const userName = userNode ? str(userNode, "dx:name", data.user.name) : data.user.name;
  const userRole = userNode ? str(userNode, "dx:role", "") : "";

  const expertiseNodes = grouped.get("dx:Expertise") ?? [];
  const preferenceNodes = grouped.get("dx:Preference") ?? [];

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/profile/graph", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonld: data.graph?.jsonld ?? makeEmptyGraph(data.user.id, data.user.name) }) });
      const result = (await res.json()) as { ok?: boolean; error?: string };
      if (result.ok) {
        // Projection 새로고침
        const projRes = await fetch("/api/profile/graph");
        const projData = (await projRes.json()) as {
          projection: string | null;
          projectionMeta: { graphVersion: number; sourceHash: string; generatedAt: string | null } | null;
        };
        setProjContent(projData.projection);
        setProjMeta(projData.projectionMeta);
      }
    } finally {
      setSyncing(false);
    }
  }, [data.graph?.jsonld, data.user.id, data.user.name]);

  return (
    <AppShell user={data.user} hideSidebar>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">프로필</h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Graph 기반 프로필을 편집하고 USER.md Projection을 미리봅니다.
          </p>
        </div>
        <Link
          to="/profile/history"
          className="text-sm text-fg-secondary hover:text-fg hover:underline"
        >
          변경 이력 보기 →
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 좌측: 편집 폼 */}
        <div className="space-y-6">
          <ProfileEditor
            userName={userName}
            userRole={userRole}
            expertiseNodes={expertiseNodes}
            preferenceNodes={preferenceNodes}
          />
          <AgentSettingsEditor
            language={data.agentSettings.language}
            style={data.agentSettings.style}
            customInstructions={data.agentSettings.customInstructions}
          />

          {/* 온보딩 튜토리얼 재실행 */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-fg">온보딩 튜토리얼</h3>
            <p className="mt-1 text-xs text-fg-secondary">
              {data.onboardingCompleted
                ? "튜토리얼을 이미 완료했습니다. 다시 보려면 아래 버튼을 클릭하세요."
                : "아직 튜토리얼을 완료하지 않았습니다."}
            </p>
            <button
              type="button"
              className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-secondary"
              onClick={async () => {
                await fetch("/api/onboarding", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "restart" }),
                });
                window.location.reload();
              }}
            >
              튜토리얼 다시 보기
            </button>
          </div>
        </div>

        {/* 우측: Projection 미리보기 */}
        <div>
          <ProjectionPreview
            content={projContent}
            meta={projMeta}
            syncing={syncing}
            onSync={handleSync}
          />
        </div>
      </div>
    </AppShell>
  );
}
