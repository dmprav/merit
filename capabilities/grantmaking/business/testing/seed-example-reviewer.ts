import { eq } from "drizzle-orm";

import { appUsers } from "@merit/auth/schema";
import { seedExampleContacts } from "@merit/contacts/server/demo";
import type { Database } from "@merit/db";
import { memberships, organizations } from "@merit/organizations/schema";
import { emptyReviewerDraft } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { createReviewerAssignment } from "@merit/reviews/server/demo";

import { getFundingApplicationPage } from "../src/server";
import { fundingExampleIds } from "../src/server/demo";

type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const seedApplicationAssignment = async (
  tx: DbTransaction,
  label: string,
  ids: Awaited<ReturnType<typeof fundingExampleIds>>,
  contacts: Awaited<ReturnType<typeof seedExampleContacts>>,
  membershipId: string,
) => {
  const manager = { userId: "local-workspace-manager" };
  const publicId = ids.applications[label];
  const contactId = contacts.get("local-reviewer");
  if (!publicId || !contactId) {
    throw new Error("Missing Alder reviewer seed prerequisites.");
  }
  const address = { workspaceSlug: "alder", publicId };
  const page = await getFundingApplicationPage(tx, manager, address);
  if (!page) {
    throw new Error("Seed the Alder example and its manager before the reviewer fixture.");
  }
  const requestId = crypto.randomUUID();
  const result = await saveApplicationReview(tx, manager, {
    ...address,
    expectedRevision: page.application.reviews.revision,
    expectedApplicationVersion: page.application.version,
    expectedCriteriaVersion: page.round.criteriaVersion,
    change: {
      action: "request",
      id: requestId,
      contactId,
      replacesId: null,
    },
  });
  if (result.status !== "ok") {
    throw new Error(`Could not seed reviewer request: ${result.status}`);
  }
  await createReviewerAssignment(
    tx,
    {
      id: crypto.randomUUID(),
      organizationId: "alder",
      caseId: address.publicId,
      requestId,
      email: "reviewer@example.test",
      membershipId,
      managerUserId: manager.userId,
      managerName: "Dana Reed",
      managerEmail: "dana@example.test",
      dueDate: "2027-04-01",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    emptyReviewerDraft(),
  );
};

/** Opt-in local fixture. Its identity is the durable marker: reseeding never restores access. */
export const seedExampleReviewer = (db: Database) =>
  db.transaction(async (tx) => {
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, "alder"))
      .for("update");
    const [created] = await tx
      .insert(appUsers)
      .values({
        id: "local-reviewer",
        clerkUserId: "local_reviewer",
        name: "Robin Ellis",
      })
      .onConflictDoNothing()
      .returning({ id: appUsers.id });
    if (!created) {
      return;
    }
    const [membership] = await tx
      .insert(memberships)
      .values({
        organizationId: "alder",
        userId: created.id,
        email: "reviewer@example.test",
        role: "reviewer",
      })
      .returning({ id: memberships.id });
    if (!membership) {
      throw new Error("Missing Alder reviewer membership.");
    }
    const contacts = await seedExampleContacts(tx, "alder", [
      {
        id: "local-reviewer",
        name: "Robin Ellis",
        email: "reviewer@example.test",
      },
    ]);
    const ids = await fundingExampleIds("alder");
    for (const label of ["A1", "A2"]) {
      await seedApplicationAssignment(tx, label, ids, contacts, membership.id);
    }
  });
