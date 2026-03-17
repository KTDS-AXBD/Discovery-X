import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import {
  parseChangelog,
  queryChangelog,
  type ChangelogFilter,
} from "~/features/lab/service/changelog-parser";
import { readChangelogFile } from "~/features/lab/service/changelog-reader.server";

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

  return json(result);
}
