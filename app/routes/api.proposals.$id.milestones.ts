import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalMilestones } from "~/features/proposals/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const proposal = await db
    .select({ tenantId: proposals.tenantId })
    .from(proposals)
    .where(eq(proposals.id, params.id!))
    .get();
  if (!proposal || proposal.tenantId !== ctx.tenantId) {
    return json({ error: "Not found" }, { status: 404 });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as {
      title: string;
      startDate?: string | null;
      endDate?: string | null;
    };

    if (!body.title?.trim()) {
      return json({ error: "Title is required" }, { status: 400 });
    }

    // Get max sortOrder for this proposal
    const existing = await db
      .select({ sortOrder: proposalMilestones.sortOrder })
      .from(proposalMilestones)
      .where(eq(proposalMilestones.proposalId, params.id!));
    const maxSort = existing.reduce((max, m) => Math.max(max, m.sortOrder), -1);

    const [created] = await db
      .insert(proposalMilestones)
      .values({
        proposalId: params.id!,
        title: body.title.trim(),
        startDate: body.startDate ?? null,
        endDate: body.endDate ?? null,
        sortOrder: maxSort + 1,
      })
      .returning({ id: proposalMilestones.id });

    return json({ success: true, id: created.id });
  }

  if (request.method === "PUT") {
    const body = (await request.json()) as {
      milestoneId: string;
      title?: string;
      status?: string;
      startDate?: string | null;
      endDate?: string | null;
    };

    const milestone = await db
      .select({ id: proposalMilestones.id })
      .from(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.id, body.milestoneId),
          eq(proposalMilestones.proposalId, params.id!),
        ),
      )
      .get();
    if (!milestone) {
      return json({ error: "Milestone not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.status !== undefined) updates.status = body.status;
    if (body.startDate !== undefined) updates.startDate = body.startDate;
    if (body.endDate !== undefined) updates.endDate = body.endDate;

    if (Object.keys(updates).length > 0) {
      await db
        .update(proposalMilestones)
        .set(updates)
        .where(eq(proposalMilestones.id, body.milestoneId));
    }

    return json({ success: true });
  }

  if (request.method === "DELETE") {
    const body = (await request.json()) as { milestoneId: string };

    const milestone = await db
      .select({ id: proposalMilestones.id })
      .from(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.id, body.milestoneId),
          eq(proposalMilestones.proposalId, params.id!),
        ),
      )
      .get();
    if (!milestone) {
      return json({ error: "Milestone not found" }, { status: 404 });
    }

    await db
      .delete(proposalMilestones)
      .where(eq(proposalMilestones.id, body.milestoneId));

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
