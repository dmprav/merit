import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@merit/db";

import type { NavigationTarget } from "../../../domain/navigation";
import { navigationPins } from "../navigation-schema";

export const lockNavigationPins = (db: Database, userId: string) =>
  db.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`navigation-pins:${userId}`}, 0))`,
  );

const targetField = (target: NavigationTarget) =>
  target.kind === "round"
    ? "roundId"
    : target.kind === "application"
      ? "applicationId"
      : "assignmentId";

export const insertNavigationPin = (
  db: Database,
  userId: string,
  target: NavigationTarget,
  position: number,
) =>
  db
    .insert(navigationPins)
    .values({ userId, [targetField(target)]: target.id, position })
    .onConflictDoNothing();

export const removeNavigationPin = (db: Database, userId: string, target: NavigationTarget) =>
  db
    .delete(navigationPins)
    .where(
      and(eq(navigationPins.userId, userId), eq(navigationPins[targetField(target)], target.id)),
    );

export const positionNavigationPin = (
  db: Database,
  userId: string,
  target: NavigationTarget,
  position: number,
) =>
  db
    .update(navigationPins)
    .set({ position })
    .where(
      and(eq(navigationPins.userId, userId), eq(navigationPins[targetField(target)], target.id)),
    );
