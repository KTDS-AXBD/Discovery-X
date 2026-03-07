import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { ProposalSectionType } from "~/features/proposals/db/schema";
import { ProposalService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalForm } from "~/features/proposals/ui/ProposalForm";
import { resolveSection } from "~/features/proposals/constants";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new ProposalService(db);
  const proposal = await service.getById(params.id!);

  if (!proposal || proposal.tenantId !== ctx.tenantId) {
    throw new Response("Not Found", { status: 404 });
  }

  // Only owner can edit, and only in PROPOSAL status
  if (proposal.ownerId !== ctx.user.id || proposal.status !== "PROPOSAL") {
    return redirect(`/proposals/${params.id}`);
  }

  const sections = await service.getSections(params.id!);

  // Build sections map with legacy resolution
  const sectionsMap: Record<string, string> = {};
  for (const s of sections) {
    const resolved = resolveSection(s.type);
    if (!sectionsMap[resolved] || s.type === resolved) {
      sectionsMap[resolved] = s.content;
    }
  }

  return json({
    proposal,
    sections: sectionsMap,
  });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new ProposalService(db);
  const proposal = await service.getById(params.id!);

  if (!proposal || proposal.tenantId !== ctx.tenantId) {
    throw new Response("Not Found", { status: 404 });
  }

  if (proposal.ownerId !== ctx.user.id || proposal.status !== "PROPOSAL") {
    return json({ error: "편집 권한이 없습니다." }, { status: 403 });
  }

  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();

  if (!title) {
    return json({ error: "제목은 필수입니다." }, { status: 400 });
  }

  const description = String(formData.get("description") || "").trim() || undefined;
  const category = String(formData.get("category") || "").trim() || null;
  const teamSize = formData.get("teamSize") ? Number(formData.get("teamSize")) : null;
  const startDate = String(formData.get("startDate") || "").trim() || null;
  const budget = String(formData.get("budget") || "").trim() || null;

  // 제안 기본 정보 업데이트
  await service.update(params.id!, ctx.tenantId, {
    title,
    description,
    category,
    teamSize,
    startDate,
    budget,
  });

  // 섹션 upsert
  const sectionTypes = Object.values(ProposalSectionType);
  const sectionsToUpsert = sectionTypes.map((type, index) => ({
    type,
    content: String(formData.get(`section_${type}`) || "").trim(),
    sortOrder: index,
  }));
  await service.upsertSections(params.id!, sectionsToUpsert);

  return redirect(`/proposals/${params.id}`);
}

export default function EditProposal() {
  const { proposal, sections } = useLoaderData<typeof loader>();

  return (
    <ProposalForm
      defaultValues={{
        title: proposal.title,
        description: proposal.description ?? undefined,
        category: proposal.category ?? undefined,
        teamSize: proposal.teamSize ?? undefined,
        startDate: proposal.startDate ?? undefined,
        budget: proposal.budget ?? undefined,
        sections,
      }}
    />
  );
}
