import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useNavigation } from "@remix-run/react";
import { eq, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { evidenceDuplicateCandidates, evidence } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { DuplicateCard } from "~/components/evidence/DuplicateCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) return redirect("/login");

  const candidates = await db
    .select()
    .from(evidenceDuplicateCandidates)
    .where(eq(evidenceDuplicateCandidates.reviewed, 0))
    .orderBy(desc(evidenceDuplicateCandidates.similarityScore));

  const enriched = [];
  for (const c of candidates) {
    const ev1 = await db.select().from(evidence).where(eq(evidence.id, c.evidenceId1)).limit(1);
    const ev2 = await db.select().from(evidence).where(eq(evidence.id, c.evidenceId2)).limit(1);
    enriched.push({
      candidate: {
        id: c.id,
        similarityScore: c.similarityScore / 100,
        reason: c.reason,
      },
      evidence1: ev1[0]
        ? { id: ev1[0].id, type: ev1[0].type, strength: ev1[0].strength, content: ev1[0].content.slice(0, 200) }
        : null,
      evidence2: ev2[0]
        ? { id: ev2[0].id, type: ev2[0].type, strength: ev2[0].strength, content: ev2[0].content.slice(0, 200) }
        : null,
    });
  }

  return json({ user, items: enriched });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) return redirect("/login");

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "review-duplicate") {
    const candidateId = String(formData.get("candidateId"));
    const decision = String(formData.get("decision"));

    const candidate = await db
      .select()
      .from(evidenceDuplicateCandidates)
      .where(eq(evidenceDuplicateCandidates.id, candidateId))
      .limit(1);

    if (!candidate[0]) {
      return json({ error: "후보를 찾을 수 없습니다." }, { status: 404 });
    }

    const reviewedStatus = decision === "merge" ? 1 : 2;

    if (decision === "merge") {
      const mergeTargetId = String(formData.get("mergeTargetId"));
      const otherId = mergeTargetId === candidate[0].evidenceId1
        ? candidate[0].evidenceId2
        : candidate[0].evidenceId1;

      const targetEv = await db.select().from(evidence).where(eq(evidence.id, mergeTargetId)).limit(1);
      const otherEv = await db.select().from(evidence).where(eq(evidence.id, otherId)).limit(1);

      if (targetEv[0] && otherEv[0]) {
        const merged = `${targetEv[0].content}\n\n[병합됨] ${otherEv[0].content}`;
        await db
          .update(evidence)
          .set({ content: merged.slice(0, 400) })
          .where(eq(evidence.id, mergeTargetId));
      }
    }

    await db
      .update(evidenceDuplicateCandidates)
      .set({
        reviewed: reviewedStatus,
        reviewedAt: new Date(),
        reviewedBy: user.id,
      })
      .where(eq(evidenceDuplicateCandidates.id, candidateId));

    return json({ success: true });
  }

  return json({ error: "알 수 없는 요청입니다" }, { status: 400 });
}

export default function EvidenceDuplicates() {
  const { user, items } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <PageLayout user={user}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">근거 중복 리뷰 큐</h1>
        <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
          미검토 {items.length}건
        </p>
      </div>

      {items.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]">
          <p className="text-sm text-[var(--axis-text-tertiary)]">검토할 중복 후보가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <DuplicateCard
              key={item.candidate.id}
              candidate={item.candidate}
              evidence1={item.evidence1}
              evidence2={item.evidence2}
              isSubmitting={isSubmitting}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
