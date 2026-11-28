import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";

import type { Database } from "@merit/db";
import { workspaceTest } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

export const seedTestRounds = async (db: Database) => {
  const create = async (workspaceSlug: string, userId: string) => {
    const result = await createFundingRound(
      db,
      { userId },
      {
        workspaceSlug,
        requestId: randomUUID(),
        title: "Community grants",
        budget: "100.00",
        meetingDate: "2027-04-15",
      },
    );
    assert(result.status === "ok", "Could not create the round fixture");
    return { workspaceSlug, publicId: result.publicId, kind: "round" as const };
  };

  const pageInput = await create("alder", "dana");
  await create("birch", "birch-manager");
  return { pageInput };
};

export const roundTest = workspaceTest.extend("rounds", { auto: true }, async ({ db }) =>
  seedTestRounds(db),
);
