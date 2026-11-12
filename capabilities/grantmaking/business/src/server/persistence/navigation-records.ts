import { and, eq, inArray, sql } from "drizzle-orm";

import { applicationCases } from "@merit/applications/schema";
import { currentMaterial } from "@merit/applications/scope";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { organizationScope } from "@merit/organizations/scope";
import { listReviewerRecords } from "@merit/reviews/readers";
import { fundingRounds } from "@merit/rounds/schema";

import {
  sameNavigationTarget,
  type NavigationPin,
  type NavigationTarget,
} from "../../domain/navigation";
import { navigationPins } from "./navigation-schema";

export const pinOwner = async (db: Database, userId: string, lock = false) => {
  const query = db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), eq(appUsers.active, true)));
  return (await (lock ? query.for("share") : query))[0];
};

export const storedPins = (db: Database, userId: string) =>
  db
    .select()
    .from(navigationPins)
    .where(eq(navigationPins.userId, userId))
    .orderBy(navigationPins.position, navigationPins.id);

const storedPinTarget = (pin: typeof navigationPins.$inferSelect): NavigationTarget =>
  pin.roundId
    ? { kind: "round", id: pin.roundId }
    : pin.applicationId
      ? { kind: "application", id: pin.applicationId }
      : { kind: "review", id: pin.assignmentId! };

const roundTargets = (db: Database, userId: string, ids: string[]) =>
  db
    .select({
      id: fundingRounds.id,
      title: fundingRounds.title,
      workspaceSlug: organizations.slug,
    })
    .from(fundingRounds)
    .innerJoin(organizations, eq(organizations.id, fundingRounds.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        inArray(fundingRounds.id, ids),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    );

const applicationTargets = (db: Database, userId: string, ids: string[]) =>
  db
    .select({
      id: applicationCases.id,
      title: sql<string>`(${currentMaterial})->>'title'`,
      context: fundingRounds.title,
      workspaceSlug: organizations.slug,
    })
    .from(applicationCases)
    .innerJoin(fundingRounds, eq(fundingRounds.id, applicationCases.roundId))
    .innerJoin(organizations, eq(organizations.id, applicationCases.organizationId))
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .innerJoin(appUsers, eq(appUsers.id, memberships.userId))
    .where(
      and(
        inArray(applicationCases.id, ids),
        organizationScope(userId, "work_on_grants", organizations.id),
      ),
    );

export const resolveNavigationTargets = async (
  db: Database,
  userId: string,
  emails: string[],
  targets: NavigationTarget[],
): Promise<NavigationPin[]> => {
  const ids = (kind: NavigationTarget["kind"]) =>
    targets.filter((target) => target.kind === kind).map((target) => target.id);

  const [rounds, applications, reviews] = await Promise.all([
    roundTargets(db, userId, ids("round")),
    applicationTargets(db, userId, ids("application")),
    ids("review").length ? listReviewerRecords(db, userId, emails) : [],
  ]);
  const available: NavigationPin[] = [
    ...rounds.map((row) => ({
      target: { kind: "round" as const, id: row.id },
      title: row.title,
      workspaceSlug: row.workspaceSlug,
      context: null,
    })),
    ...applications.map((row) => ({
      target: { kind: "application" as const, id: row.id },
      title: row.title,
      workspaceSlug: row.workspaceSlug,
      context: row.context,
    })),
    ...reviews.map((row) => ({
      target: { kind: "review" as const, id: row.assignment.id },
      title: row.title,
      workspaceSlug: null,
      context: row.organization,
    })),
  ];
  return targets.flatMap((target) => {
    const pin = available.find((item) => sameNavigationTarget(item.target, target));
    return pin ? [pin] : [];
  });
};

export const visibleNavigationPins = async (db: Database, userId: string, emails: string[]) =>
  resolveNavigationTargets(db, userId, emails, (await storedPins(db, userId)).map(storedPinTarget));
