import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { createFundingApplication, selectApplicationContact } from "@merit/applications/server";
import { changeWorkspaceContact, listWorkspaceContacts } from "@merit/contacts/server";
import { listContactApplications, listFundingApplications } from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound } from "@merit/rounds/server";

import { contactWork } from "./contact-work";

it("pages distinct related applications with actual round titles and all recorded relationships", async ({
  db,
}) => {
  const contact = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create",
      details: {
        name: "Leah Martin",
        email: "leah@example.test",
        affiliation: "Neighbourhood Kitchen",
      },
    },
    contactWork,
  );
  assert(contact.status === "ok");
  const input = { workspaceSlug, contactId: contact.contact.id };
  const expected = [];
  for (const [index, roundTitle] of ["Community grants 2025", "Stronger communities"].entries()) {
    const round = await createFundingRound(db, actor, {
      workspaceSlug,
      requestId: randomUUID(),
      title: roundTitle,
    });
    assert(round.status === "ok");
    const application = await createFundingApplication(db, actor, {
      workspaceSlug,
      publicId: round.publicId,
      requestId: randomUUID(),
      title: "Neighbour Table",
    });
    assert(application.status === "ok");
    expect(
      await selectApplicationContact(db, actor, {
        workspaceSlug,
        publicId: application.publicId,
        expectedRevision: 0,
        contactId: contact.contact.id,
      }),
    ).toMatchObject({ status: "ok" });
    if (index === 0) {
      const requestId = randomUUID();
      const address = {
        workspaceSlug,
        publicId: application.publicId,
        expectedApplicationVersion: materialVersionSchema.parse(1),
        expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      };
      expect(
        await saveApplicationReview(db, actor, {
          ...address,
          expectedRevision: reviewRevisionSchema.parse(0),
          change: {
            action: "request",
            id: requestId,
            contactId: contact.contact.id,
            replacesId: null,
          },
        }),
      ).toMatchObject({ status: "ok" });
      expect(
        await saveApplicationReview(db, actor, {
          ...address,
          expectedRevision: reviewRevisionSchema.parse(1),
          change: {
            action: "record",
            id: randomUUID(),
            contactId: contact.contact.id,
            requestId,
            previousId: null,
            content: {
              applicationVersion: materialVersionSchema.parse(1),
              criteriaVersion: criteriaVersionSchema.parse(1),
              date: null,
              position: "Fund",
              amount: null,
              reasoning: "A practical plan.",
              observations: [],
            },
          },
        }),
      ).toMatchObject({ status: "ok" });
    }
    expected.push({
      applicationId: application.publicId,
      title: "Neighbour Table",
      roundTitle,
      relationships:
        index === 0
          ? ["applicant_contact", "review_requested", "assessment_recorded"]
          : ["applicant_contact"],
    });
    const ordinary = await listFundingApplications(db, actor, {
      workspaceSlug,
      roundId: round.publicId,
    });
    assert(ordinary.status === "ok");
    expect(ordinary.applications[0]).not.toHaveProperty("relationships");
    expect(ordinary.applications[0]).not.toHaveProperty("roundTitle");
    // An organization name matching the person's affiliation is not a contact relationship.
    expect(
      await createFundingApplication(db, actor, {
        workspaceSlug,
        publicId: round.publicId,
        requestId: randomUUID(),
        title: "Unrelated work",
        applicant: "Neighbourhood Kitchen",
      }),
    ).toMatchObject({ status: "ok" });
  }
  // The directory lists each related application once, however many relationships link it.
  const directory = await listWorkspaceContacts(db, actor, { workspaceSlug }, contactWork);
  assert(directory.status === "ok");
  expect(directory.contacts.find(({ id }) => id === contact.contact.id)?.applicationTitles).toEqual(
    ["Neighbour Table", "Neighbour Table"],
  );

  const first = await listContactApplications(db, actor, { ...input, limit: 1 });
  assert(first.status === "ok" && first.nextCursor);
  const second = await listContactApplications(db, actor, {
    ...input,
    limit: 1,
    after: first.nextCursor,
  });
  assert(second.status === "ok");
  expect(second.nextCursor).toBeNull();
  expect([...first.applications, ...second.applications]).toMatchObject(
    expected.sort((a, b) => a.applicationId.localeCompare(b.applicationId)),
  );
  expect(await listContactApplications(db, { userId: "birch-manager" }, input)).toEqual({
    status: "not_found",
  });
  await db.execute(sql`delete from memberships where user_id = ${actor.userId}`);
  expect(await listContactApplications(db, actor, { ...input, after: first.nextCursor })).toEqual({
    status: "not_found",
  });
});
