import { asc, desc, sql } from "drizzle-orm";

import type { Database } from "@merit/db";

import { accessRequests } from "../access-request-schema";

export const listAccessRequests = (db: Database) =>
  db
    .select()
    .from(accessRequests)
    .orderBy(
      sql`${accessRequests.reviewedAt} IS NOT NULL`,
      desc(accessRequests.requestedAt),
      asc(accessRequests.email),
    );
