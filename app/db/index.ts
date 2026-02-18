import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as ventureSchema from "~/features/venture/db/schema";
import * as proposalSchema from "~/features/proposals/db/schema";
import * as archiveSchema from "~/features/archive/db/schema";
import * as ideasSchema from "~/features/ideas/db/schema";
import * as tokenUsageSchema from "./token-usage-schema";
import * as v2Schema from "./schema-v2";
import * as matrixSchema from "~/features/matrix/db/schema";

const allSchema = { ...schema, ...ventureSchema, ...proposalSchema, ...archiveSchema, ...ideasSchema, ...tokenUsageSchema, ...v2Schema, ...matrixSchema };

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema: allSchema });
}

export type DB = ReturnType<typeof getDb>;

export * from "./schema";
export * from "~/features/venture/db/schema";
export * from "~/features/proposals/db/schema";
export * from "~/features/archive/db/schema";
export * from "~/features/ideas/db/schema";
export * from "./token-usage-schema";
export * from "./schema-v2";
export * from "~/features/matrix/db/schema";
