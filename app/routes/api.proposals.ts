import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { proposals, proposalSections, proposalCategories } from "~/features/proposals/db/schema";
import { validateProposalTransition } from "~/features/proposals/constants";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const list = await db
    .select()
    .from(proposals)
    .where(eq(proposals.tenantId, ctx.tenantId))
    .orderBy(desc(proposals.updatedAt));

  return json({ proposals: list });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "PUT") {
    const body = await request.json() as {
      id: string;
      title?: string;
      description?: string;
      category?: string | null;
      teamSize?: number | null;
      startDate?: string | null;
      budget?: string | null;
      status?: string;
      closeType?: string | null;
      sections?: Array<{ type: string; content: string }>;
    };

    const proposal = await db.select({ id: proposals.id, tenantId: proposals.tenantId, ownerId: proposals.ownerId, status: proposals.status })
      .from(proposals).where(eq(proposals.id, body.id)).get();
    if (!proposal || proposal.tenantId !== ctx.tenantId) {
      return json({ error: "Not found" }, { status: 404 });
    }

    // Status transition validation
    if (body.status !== undefined && body.status !== proposal.status) {
      if (!validateProposalTransition(proposal.status, body.status)) {
        return json(
          { error: `상태 전환 불가: ${proposal.status} → ${body.status}` },
          { status: 400 },
        );
      }
      // CLOSED requires close_type
      if (body.status === "CLOSED" && !body.closeType) {
        return json(
          { error: "종료 시 close_type(HOLD/DROP)이 필요합니다" },
          { status: 400 },
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.teamSize !== undefined) updates.teamSize = body.teamSize;
    if (body.startDate !== undefined) updates.startDate = body.startDate;
    if (body.budget !== undefined) updates.budget = body.budget;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "CLOSED") {
        updates.closeType = body.closeType;
        updates.closedAt = sql`(unixepoch())`;
      } else {
        // Moving out of CLOSED resets close fields
        if (proposal.status === "CLOSED") {
          updates.closeType = null;
          updates.closedAt = null;
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = sql`(unixepoch())`;
      await db.update(proposals).set(updates).where(eq(proposals.id, body.id));
    }

    if (body.sections && body.sections.length > 0) {
      for (const sec of body.sections) {
        await db.update(proposalSections)
          .set({ content: sec.content })
          .where(and(
            eq(proposalSections.proposalId, body.id),
            eq(proposalSections.type, sec.type)
          ));
      }
    }

    // Upsert category into proposal_categories if provided
    if (body.category) {
      const existing = await db.select().from(proposalCategories)
        .where(and(
          eq(proposalCategories.tenantId, ctx.tenantId),
          eq(proposalCategories.name, body.category),
        )).get();
      if (existing) {
        await db.update(proposalCategories)
          .set({ usageCount: sql`${proposalCategories.usageCount} + 1` })
          .where(eq(proposalCategories.id, existing.id));
      } else {
        await db.insert(proposalCategories).values({
          tenantId: ctx.tenantId,
          name: body.category,
          usageCount: 1,
        });
      }
    }

    return json({ success: true });
  }

  if (request.method === "DELETE") {
    const body = await request.json() as { id: string };

    const proposal = await db.select({ id: proposals.id, tenantId: proposals.tenantId, ownerId: proposals.ownerId })
      .from(proposals).where(eq(proposals.id, body.id)).get();
    if (!proposal || proposal.tenantId !== ctx.tenantId) {
      return json({ error: "Not found" }, { status: 404 });
    }
    if (proposal.ownerId !== ctx.user.id) {
      return json({ error: "Forbidden" }, { status: 403 });
    }

    await db.delete(proposals).where(eq(proposals.id, body.id));
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
