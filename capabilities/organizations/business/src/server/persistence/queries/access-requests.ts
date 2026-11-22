import { asc, desc, eq, sql } from "drizzle-orm";

import type { Database } from "@merit/db";

import { accessRequests } from "../access-request-schema";

export const listAccessRequests = async (
  db: Database,
  { after, limit }: { after?: { id: string; reviewed: boolean }; limit: number },
) => {
  const { reviewedAt, requestedAt, email } = accessRequests;
  const reviewed = sql`(${reviewedAt} IS NOT NULL)`;
  // Look up the immutable timestamp in Postgres to retain sub-millisecond precision.
  const anchor =
    after &&
    db
      .select({
        reviewed: sql<boolean>`${after.reviewed}::boolean`,
        received: sql`-extract(epoch from ${requestedAt})`,
        email,
      })
      .from(accessRequests)
      .where(eq(accessRequests.id, after.id));
  const rows = await db
    .select()
    .from(accessRequests)
    .where(anchor && sql`(${reviewed}, -extract(epoch from ${requestedAt}), ${email}) > ${anchor}`)
    .orderBy(reviewed, desc(requestedAt), asc(email))
    .limit(limit + 1);
  const requests = rows.slice(0, limit);
  const last = requests.at(-1);
  return {
    requests,
    nextCursor:
      rows.length > limit && last ? { reviewed: last.reviewedAt !== null, id: last.id } : null,
  };
};
