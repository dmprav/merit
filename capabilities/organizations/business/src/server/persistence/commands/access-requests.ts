import { eq, lt, lte, sql } from "drizzle-orm";

import { accessRequests, accessRequestLimits } from "../access-request-schema";
import type { Transaction } from "../transaction";

export const recordAccessRequest = async (tx: Transaction, email: string, bucket: string) => {
  await tx.delete(accessRequestLimits).where(lte(accessRequestLimits.expiresAt, new Date()));
  const allowed = await tx
    .insert(accessRequestLimits)
    .values({ key: bucket, expiresAt: new Date(Date.now() + 3600000) })
    .onConflictDoUpdate({
      target: accessRequestLimits.key,
      set: { attempts: sql`${accessRequestLimits.attempts} + 1` },
      setWhere: lt(accessRequestLimits.attempts, 10),
    })
    .returning({ key: accessRequestLimits.key });
  if (!allowed.length) {
    return { status: "limited" } as const;
  }

  // Retries and repeated interest retain the original request and its review status.
  await tx.insert(accessRequests).values({ email }).onConflictDoNothing();
  return { status: "ok" } as const;
};

export const markAccessRequestReviewed = async (
  db: Transaction,
  email: string,
  actorUserId: string,
) => {
  await db
    .update(accessRequests)
    .set({ reviewedAt: new Date(), reviewedBy: actorUserId })
    .where(sql`${accessRequests.email} = ${email} AND ${accessRequests.reviewedAt} IS NULL`);
  return (await db.select().from(accessRequests).where(eq(accessRequests.email, email)))[0] ?? null;
};
