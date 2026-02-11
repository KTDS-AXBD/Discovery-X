import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as ventureSchema from "~/features/venture/db/schema";
import * as proposalSchema from "~/features/proposals/db/schema";
import * as archiveSchema from "~/features/archive/db/schema";
import * as ideasSchema from "~/features/ideas/db/schema";

const allSchema = { ...schema, ...ventureSchema, ...proposalSchema, ...archiveSchema, ...ideasSchema };

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema: allSchema });
}

export type DB = ReturnType<typeof getDb>;

export * from "./schema";
export * from "~/features/venture/db/schema";
export * from "~/features/proposals/db/schema";
export * from "~/features/archive/db/schema";
export * from "~/features/ideas/db/schema";
