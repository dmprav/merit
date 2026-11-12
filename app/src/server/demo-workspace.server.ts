import type { Actor } from "@merit/auth";
import { ensureInactiveUser } from "@merit/auth/server";
import type { Database } from "@merit/db";
import { getFundingRoundPage } from "@merit/grantmaking/server";
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

type DatabaseRunner = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

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
  const application = round?.round.applications.find((item) => item.id === ids.applications.A3);
  return {
    status: "ready" as const,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    expiresAt: workspace.demoExpiresAt!.toISOString(),
    ...(application ? { applicationRef: application.id } : {}),
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

export const createAccountDemoServices = (database: DatabaseRunner, networkAddress?: string) => ({
  read: async (actor: Actor) => {
    const result = await database((db) => readDemoWorkspace(db, actor));
    return result.status === "ready" ? demoDestination(database, result.workspace, actor) : result;
  },
  start: async (actor: Actor, input: { fresh: boolean; resetWorkspaceId?: string }) => {
    if (networkAddress && !(await database((db) => allowDemoEntry(db, networkAddress)))) {
      return { status: "limited" } as const;
    }
    const result = await database((db) => seedDemoWorkspace(db, actor, input));
    return result.status === "ready" ? demoDestination(database, result.workspace, actor) : result;
  },
});
