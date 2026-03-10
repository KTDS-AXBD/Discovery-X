import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as discoverySchema from "~/features/discovery/db/schema";
import * as radarSchema from "~/features/radar/db/schema";
import * as chatSchema from "~/features/chat/db/schema";
import * as labSchema from "~/features/lab/db/schema";
import * as proposalSchema from "~/features/proposals/db/schema";
import * as archiveSchema from "~/features/archive/db/schema";
import * as ideasSchema from "~/features/ideas/db/schema";
import * as tokenUsageSchema from "./token-usage-schema";
import * as v2Schema from "./schema-v2";
import * as matrixSchema from "~/features/matrix/db/schema";
import * as requestsSchema from "~/features/requests/db/schema";
import * as topicSchema from "~/features/topic/db/schema";
import * as costSchema from "~/features/cost/db/schema";

const allSchema = { ...schema, ...discoverySchema, ...radarSchema, ...chatSchema, ...labSchema, ...proposalSchema, ...archiveSchema, ...ideasSchema, ...tokenUsageSchema, ...v2Schema, ...matrixSchema, ...requestsSchema, ...topicSchema, ...costSchema };

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema: allSchema });
}

export type DB = ReturnType<typeof getDb>;

export * from "./schema";
export * from "~/features/discovery/db/schema";
export * from "~/features/radar/db/schema";
export * from "~/features/chat/db/schema";
export * from "~/features/lab/db/schema";
export * from "~/features/proposals/db/schema";
export * from "~/features/archive/db/schema";
export * from "~/features/ideas/db/schema";
export * from "./token-usage-schema";
export * from "./schema-v2";
export * from "~/features/matrix/db/schema";
export * from "~/features/requests/db/schema";
export * from "~/features/topic/db/schema";
// cost schema는 ~/db에서 re-export하지 않음 (vi.mock 호환성)
// 사용처에서 직접 import: from "~/features/cost/db/schema"
