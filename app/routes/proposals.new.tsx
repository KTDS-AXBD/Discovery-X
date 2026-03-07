import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { ProposalSectionType } from "~/features/proposals/db/schema";
import { ProposalService } from "~/features/proposals/service/proposal.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalForm } from "~/features/proposals/ui/ProposalForm";

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();

  if (!title) {
    return json({ error: "제목은 필수입니다." }, { status: 400 });
  }

  // 섹션 내용 수집
  const sectionContents: Record<string, string> = {};
  for (const type of Object.values(ProposalSectionType)) {
    sectionContents[type] = String(formData.get(`section_${type}`) || "").trim();
  }

  const service = new ProposalService(db);
  const id = await service.create({
    tenantId: ctx.tenantId,
    title,
    ownerId: ctx.user.id,
    description: String(formData.get("description") || "").trim() || null,
    category: String(formData.get("category") || "").trim() || null,
    teamSize: formData.get("teamSize") ? Number(formData.get("teamSize")) : null,
    startDate: String(formData.get("startDate") || "").trim() || null,
    budget: String(formData.get("budget") || "").trim() || null,
    sectionContents,
  });

  return redirect(`/proposals/${id}`);
}

export default function NewProposal() {
  return <ProposalForm />;
}
