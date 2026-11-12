import { and, eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import { ensureInactiveUser } from "@merit/auth/server";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { fundingRounds } from "@merit/rounds/schema";

import { fundingExampleAuthor, fundingExampleIds, seedFundingExample } from "../src/server/demo";

export const seedExampleRounds = async (db: Database, clerkUserId = "seed_alder") => {
  await db.transaction(async (tx) => {
    await seedWorkspaceAccess(tx, clerkUserId);

    const authorUserId = await ensureInactiveUser(tx, fundingExampleAuthor);
    for (const organizationId of ["alder", "birch"]) {
      const { roundId } = await fundingExampleIds(organizationId);
      await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .for("update");
      const [existing] = await tx
        .select({ id: fundingRounds.id })
        .from(fundingRounds)
        .where(
          and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)),
        );
      if (existing) {
        continue;
      }

      await seedFundingExample(
        tx,
        organizationId,
        organizationId === "alder" ? "dana" : "birch-manager",
        authorUserId,
      );
      if (organizationId === "birch") {
        await tx
          .update(fundingRounds)
          .set({ title: "Birch community fund" })
          .where(
            and(eq(fundingRounds.organizationId, organizationId), eq(fundingRounds.id, roundId)),
          );
      }
    }
  });
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const seedWorkspaceAccess = async (tx: Transaction, clerkUserId: string) => {
  await tx
    .insert(organizations)
    .values([
      { id: "alder", name: "Alder Foundation", slug: "alder" },
      { id: "birch", name: "Birch Foundation", slug: "birch" },
    ])
    .onConflictDoNothing();

  await tx
    .insert(appUsers)
    .values([
      { id: "dana", clerkUserId, name: "Dana Reed" },
      {
        id: "birch-manager",
        clerkUserId: "seed_birch",
        name: "Birch manager",
      },
      {
        id: "local-workspace-manager",
        clerkUserId: "seed_local_workspace",
        name: "Dana Reed",
      },
    ])
    .onConflictDoNothing();
  // Explicit local setup can link an existing fixture user to a Clerk development user.
  if (clerkUserId !== "seed_alder") {
    await tx.update(appUsers).set({ clerkUserId }).where(eq(appUsers.id, "dana"));
  }

  await tx
    .insert(memberships)
    .values([
      {
        organizationId: "alder",
        userId: "dana",
        email: "dana.clerk@example.test",
        role: "program_manager",
      },
      {
        organizationId: "birch",
        userId: "birch-manager",
        email: "birch@example.test",
        role: "program_manager",
        administration: "owner",
      },
      {
        organizationId: "alder",
        userId: "local-workspace-manager",
        email: "dana@example.test",
        role: "program_manager",
        administration: "owner",
      },
    ])
    .onConflictDoNothing();
};
