import type { Actor } from "@merit/auth";
import { ensureInactiveUser } from "@merit/auth/server";
import type { Database, DatabaseRunner } from "@merit/db";
import { getFundingRoundPage, getFundingApplicationContext } from "@merit/grantmaking/server";
import {
  exampleSeedVersion,
  fundingExampleAuthor,
  fundingExampleIds,
  seedFundingExample,
} from "@merit/grantmaking/server/demo";
import {
  readDemoWorkspace,
  startDemoWorkspace,
  allowDemoEntry,
} from "@merit/organizations/server/demo";

// Only the local web demo explicitly disables the limit. A missing address denies entry.
export const checkDemoEntry = async (
  database: DatabaseRunner,
  networkAddress: string | undefined | false,
) => {
  if (networkAddress === false) {
    return null;
  }
  if (!networkAddress) {
    return { status: "unavailable" } as const;
  }
  const allowed = await database((db) => allowDemoEntry(db, networkAddress));
  return allowed ? null : ({ status: "limited" } as const);
};

export const demoDestination = async (
  database: DatabaseRunner,
  workspace: { id: string; slug: string; demoExpiresAt: Date | null },
  actor: Actor,
) => {
  const ids = await fundingExampleIds(workspace.id);
  const round = await database((db) =>
    getFundingRoundPage(db, actor, {
      workspaceSlug: workspace.slug,
      publicId: ids.roundId,
      kind: "round",
    }),
  );
  const application = await database((db) =>
    getFundingApplicationContext(db, actor, {
      workspaceSlug: workspace.slug,
      applicationId: ids.applications.A3!,
    }),
  );
  return {
    status: "ready" as const,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    expiresAt: workspace.demoExpiresAt!.toISOString(),
    ...(application.status === "ok" ? { applicationRef: ids.applications.A3 } : {}),
    ...(round ? { roundRef: round.round.id } : {}),
  };
};

export const seedDemoWorkspace = (
  db: Database,
  actor: Actor,
  input: { fresh: boolean; resetWorkspaceId?: string },
) =>
  startDemoWorkspace(db, actor, input, exampleSeedVersion, async (connection, workspace, userId) =>
    seedFundingExample(
      connection,
      workspace.id,
      userId,
      await ensureInactiveUser(connection, fundingExampleAuthor),
    ),
  );

export const createAccountDemoServices = (
  database: DatabaseRunner,
  networkAddress: string | undefined,
) => ({
  read: async (actor: Actor) => {
    const result = await database((db) => readDemoWorkspace(db, actor));
    return result.status === "ready" ? demoDestination(database, result.workspace, actor) : result;
  },
  start: async (actor: Actor, input: { fresh: boolean; resetWorkspaceId?: string }) => {
    const problem = await checkDemoEntry(database, networkAddress);
    if (problem) {
      return problem;
    }
    const result = await database((db) => seedDemoWorkspace(db, actor, input));
    return result.status === "ready" ? demoDestination(database, result.workspace, actor) : result;
  },
});
