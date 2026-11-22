import { and, eq, inArray } from "drizzle-orm";

import { applicationCases, materialVersions } from "@merit/applications/schema";
import { appUsers } from "@merit/auth/schema";
import type { Database } from "@merit/db";
import { authorizedWorkspaces } from "@merit/organizations/scope";
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

const storedPinTarget = (pin: typeof navigationPins.$inferSelect): NavigationTarget => {
  if (pin.roundId) {
    return { kind: "round", id: pin.roundId };
  }
  if (pin.applicationId) {
    return { kind: "application", id: pin.applicationId };
  }
  if (pin.assignmentId) {
    return { kind: "review", id: pin.assignmentId };
  }
  throw new Error(`Navigation pin ${pin.id} is missing a target.`);
};

const roundTargets = (db: Database, userId: string, ids: string[]) => {
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants");
  return db
    .select({
      id: fundingRounds.id,
      title: fundingRounds.title,
      workspaceSlug: workspace.slug,
    })
    .from(fundingRounds)
    .innerJoin(workspace, eq(workspace.id, fundingRounds.organizationId))
    .where(inArray(fundingRounds.id, ids));
};

const applicationTargets = (db: Database, userId: string, ids: string[]) => {
  const workspace = authorizedWorkspaces(db, userId, "work_on_grants");
  return db
    .select({
      id: applicationCases.id,
      title: materialVersions.title,
      context: fundingRounds.title,
      workspaceSlug: workspace.slug,
    })
    .from(applicationCases)
    .innerJoin(
      materialVersions,
      and(
        eq(materialVersions.caseId, applicationCases.id),
        eq(materialVersions.version, applicationCases.materialVersion),
      ),
    )
    .innerJoin(fundingRounds, eq(fundingRounds.id, applicationCases.roundId))
    .innerJoin(workspace, eq(workspace.id, applicationCases.organizationId))
    .where(inArray(applicationCases.id, ids));
};

export const resolveNavigationTargets = async (
  db: Database,
  userId: string,
  targets: NavigationTarget[],
): Promise<NavigationPin[]> => {
  const ids = (kind: NavigationTarget["kind"]) =>
    targets.filter((target) => target.kind === kind).map((target) => target.id);

  const [rounds, applications, reviews] = await Promise.all([
    roundTargets(db, userId, ids("round")),
    applicationTargets(db, userId, ids("application")),
    ids("review").length ? listReviewerRecords(db, userId) : [],
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
      workspaceSlug: row.slug,
      context: row.organization,
    })),
  ];
  return targets.flatMap((target) => {
    const pin = available.find((item) => sameNavigationTarget(item.target, target));
    return pin ? [pin] : [];
  });
};

export const visibleNavigationPins = async (db: Database, userId: string) =>
  resolveNavigationTargets(db, userId, (await storedPins(db, userId)).map(storedPinTarget));
