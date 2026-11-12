import { databaseTest } from "@merit/test-support/database";

import { seedWorkspace } from "./seed-workspace";

export const actor = { userId: "dana" };
export const workspaceSlug = "alder";

export const workspaceTest = databaseTest.extend("workspaces", { auto: true }, async ({ db }) => {
  await seedWorkspace(db, {
    organization: { id: "alder", slug: workspaceSlug, name: "Alder Foundation" },
    user: { id: "dana", clerkUserId: "seed_alder", name: "Dana Reed" },
    membership: { role: "program_manager", administration: "none" },
  });
  await seedWorkspace(db, {
    organization: { id: "birch", slug: "birch", name: "Birch Foundation" },
    user: { id: "birch-manager", clerkUserId: "seed_birch", name: "Birch manager" },
    membership: { role: "program_manager", administration: "owner" },
  });
});
