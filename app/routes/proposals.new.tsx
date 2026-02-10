import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { proposals, proposalSections, ProposalSectionType } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalForm } from "~/components/proposals/ProposalForm";

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

  const id = crypto.randomUUID();
  const description = String(formData.get("description") || "").trim() || null;
  const teamSize = formData.get("teamSize") ? Number(formData.get("teamSize")) : null;
  const startDate = String(formData.get("startDate") || "").trim() || null;
  const budget = String(formData.get("budget") || "").trim() || null;

  await db.insert(proposals).values({
    id,
    tenantId: ctx.tenantId,
    title,
    description,
    teamSize,
    startDate,
    budget,
    ownerId: ctx.user.id,
  });

  // Insert sections
  const sectionTypes = Object.values(ProposalSectionType);
  const sectionValues = sectionTypes.map((type, i) => ({
    proposalId: id,
    type,
    content: String(formData.get(`section_${type}`) || "").trim(),
    sortOrder: i,
  }));
  await db.insert(proposalSections).values(sectionValues);

  return redirect(`/proposals/${id}`);
}

export default function NewProposal() {
  return <ProposalForm />;
}
