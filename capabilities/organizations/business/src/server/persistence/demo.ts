import { and, desc, eq, lte } from "drizzle-orm";

import type { Database } from "@merit/db";

import { memberships, organizations } from "./membership-schema";

export type Demo = typeof organizations.$inferSelect;

export const currentDemo = async (db: Database, userId: string) => {
  const [row] = await db
    .select({ workspace: organizations })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), eq(organizations.kind, "demo")))
    .orderBy(desc(organizations.demoExpiresAt))
    .limit(1);

  return row?.workspace;
};

export const expiredDemos = (db: Database) =>
  db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.kind, "demo"), lte(organizations.demoExpiresAt, new Date())))
    .limit(100);

export const hasMembership = async (db: Database, userId: string) => {
  const [membership] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  return !!membership;
};
