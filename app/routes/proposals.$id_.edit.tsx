import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalSections, ProposalSectionType } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { ProposalForm } from "~/components/proposals/ProposalForm";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const proposal = await db.select().from(proposals).where(eq(proposals.id, params.id!)).get();

  if (!proposal || proposal.tenantId !== ctx.tenantId) {
    throw new Response("Not Found", { status: 404 });
  }

  // Only owner can edit, and only in DRAFT status
  if (proposal.ownerId !== ctx.user.id || proposal.status !== "DRAFT") {
    return redirect(`/proposals/${params.id}`);
  }

  const sections = await db
    .select()
    .from(proposalSections)
    .where(eq(proposalSections.proposalId, params.id!));

  const sectionsMap: Record<string, string> = {};
  for (const s of sections) {
    sectionsMap[s.type] = s.content;
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

  const proposal = await db.select().from(proposals).where(eq(proposals.id, params.id!)).get();

  if (!proposal || proposal.tenantId !== ctx.tenantId) {
    throw new Response("Not Found", { status: 404 });
  }

  if (proposal.ownerId !== ctx.user.id || proposal.status !== "DRAFT") {
    return json({ error: "편집 권한이 없습니다." }, { status: 403 });
  }

  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();

  if (!title) {
    return json({ error: "제목은 필수입니다." }, { status: 400 });
  }

  const description = String(formData.get("description") || "").trim() || null;
  const teamSize = formData.get("teamSize") ? Number(formData.get("teamSize")) : null;
  const startDate = String(formData.get("startDate") || "").trim() || null;
  const budget = String(formData.get("budget") || "").trim() || null;

  await db.update(proposals).set({
    title,
    description,
    teamSize,
    startDate,
    budget,
    updatedAt: sql`(unixepoch())`,
  }).where(eq(proposals.id, params.id!));

  // Upsert sections
  const sectionTypes = Object.values(ProposalSectionType);
  for (const type of sectionTypes) {
    const content = String(formData.get(`section_${type}`) || "").trim();
    const existing = await db
      .select()
      .from(proposalSections)
      .where(eq(proposalSections.proposalId, params.id!))
      .all()
      .then((rows) => rows.find((r) => r.type === type));

    if (existing) {
      await db.update(proposalSections).set({ content }).where(eq(proposalSections.id, existing.id));
    } else {
      await db.insert(proposalSections).values({
        proposalId: params.id!,
        type,
        content,
        sortOrder: sectionTypes.indexOf(type),
      });
    }
  }

  return redirect(`/proposals/${params.id}`);
}

export default function EditProposal() {
  const { proposal, sections } = useLoaderData<typeof loader>();

  return (
    <ProposalForm
      defaultValues={{
        title: proposal.title,
        description: proposal.description ?? undefined,
        teamSize: proposal.teamSize ?? undefined,
        startDate: proposal.startDate ?? undefined,
        budget: proposal.budget ?? undefined,
        sections,
      }}
    />
  );
}
