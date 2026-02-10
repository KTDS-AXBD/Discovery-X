import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as ventureSchema from "~/features/venture/db/schema";
import * as proposalSchema from "~/features/proposals/db/schema";

const allSchema = { ...schema, ...ventureSchema, ...proposalSchema };

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema: allSchema });
}

export type DB = ReturnType<typeof getDb>;

export * from "./schema";
export * from "~/features/venture/db/schema";
export * from "~/features/proposals/db/schema";
