import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { inArray } from "drizzle-orm";
import {
  parseChangelog,
  queryChangelog,
  type ChangelogFilter,
} from "~/features/lab/service/changelog-parser";
import { readChangelogFile } from "~/features/lab/service/changelog-reader.server";
import { changelogFeedback } from "~/features/lab/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "0", 10);
  const pageSize = parseInt(url.searchParams.get("pageSize") || "10", 10);
  const fItem = url.searchParams.get("fItem");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const search = url.searchParams.get("search");

  const filter: ChangelogFilter = {};
  if (fItem) filter.fItem = parseInt(fItem, 10);
  if (dateFrom) filter.dateFrom = dateFrom;
  if (dateTo) filter.dateTo = dateTo;
  if (search) filter.search = search;

  const content = await readChangelogFile();
  const parsed = parseChangelog(content);
  const result = queryChangelog(parsed, {
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    page,
    pageSize,
  });

  const sessionIds = result.sessions.map((s) => s.id);
  const relevantFeedback =
    sessionIds.length > 0
      ? await db
          .select()
          .from(changelogFeedback)
          .where(inArray(changelogFeedback.sessionId, sessionIds))
      : [];

  const feedbackMap: Record<
    string,
    {
      emojis: { emoji: string; count: number; myReaction: boolean }[];
      commentCount: number;
    }
  > = {};
  for (const sid of sessionIds) {
    const sessionFb = relevantFeedback.filter((f) => f.sessionId === sid);
    const emojiMap: Record<string, { count: number; myReaction: boolean }> = {};
    let commentCount = 0;
    for (const fb of sessionFb) {
      if (fb.type === "emoji" && fb.emoji) {
        if (!emojiMap[fb.emoji])
          emojiMap[fb.emoji] = { count: 0, myReaction: false };
        emojiMap[fb.emoji].count++;
        if (fb.userId === ctx.user.id) emojiMap[fb.emoji].myReaction = true;
      } else if (fb.type === "comment") {
        commentCount++;
      }
    }
    feedbackMap[sid] = {
      emojis: Object.entries(emojiMap).map(([emoji, data]) => ({
        emoji,
        ...data,
      })),
      commentCount,
    };
  }

  return json({ ...result, feedbackMap });
}
