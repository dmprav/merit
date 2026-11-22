import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import {
  createFundingApplication,
  editFundingApplication,
  selectApplicationContact,
} from "@merit/applications/server";
import { changeWorkspaceContact } from "@merit/contacts/server";
import {
  getFundingApplicationContent,
  getFundingApplicationContext,
} from "@merit/grantmaking/server";
import { actor, workspaceTest as it, workspaceSlug } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

import { applicationWork } from "./application-work";
import { contactWork } from "./contact-work";

it("reads authorized case context and material by application ID without round input", async ({
  db,
}) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Intake group",
  });
  assert(round.status === "ok");
  const application = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Independent request",
    applicant: "Community group",
    requested: "25.01",
    answers: [
      {
        questionId: "87fccd1f-7f91-5e18-a784-9d11a01c0665",
        question: "Purpose",
        response: "Keep the request independently addressable.",
      },
    ],
  });
  assert(application.status === "ok");

  const input = { workspaceSlug, applicationId: application.publicId };
  expect(await getFundingApplicationContext(db, actor, input)).toMatchObject({
    status: "ok",
    application: {
      applicationId: application.publicId,
      roundId: round.publicId,
      title: "Independent request",
      criteriaVersion: 1,
      roundPreparationRevision: 0,
      requested: { minorUnits: "2501", currency: "EUR" },
      requestedDisplay: "€25.01",
    },
  });
  const material = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "submission",
  });
  assert(material.status === "ok");
  expect(JSON.parse(material.content)).toMatchObject({ organization: "Community group" });
  expect(await getFundingApplicationContext(db, { userId: "birch-manager" }, input)).toEqual({
    status: "not_found",
  });
});

it("reads immutable material versions without mixing in later staff interpretation", async ({
  db,
}) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Versioned material",
  });
  assert(round.status === "ok");
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Original request",
    applicant: "Applicant",
    requested: "10",
    answers: [
      {
        questionId: "87fccd1f-7f91-5e18-a784-9d11a01c0665",
        question: "Purpose",
        response: "Original evidence",
      },
    ],
  });
  assert(created.status === "ok");
  const input = { workspaceSlug, applicationId: created.publicId, section: "material" as const };
  const original = await getFundingApplicationContent(db, actor, { ...input, materialVersion: 1 });
  assert(original.status === "ok");
  expect(JSON.parse(original.content)).toMatchObject({
    version: 1,
    source: { kind: "recorded_external" },
    content: {
      title: "Original request",
      submission: { answers: [{ response: "Original evidence" }] },
    },
  });

  const changed = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: created.publicId,
      expectedRevision: 0,
      change: { action: "save_content", content: { title: "Updated request" } },
    },
    applicationWork,
  );
  assert(changed.status === "ok");
  const annotated = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: created.publicId,
      expectedRevision: changed.revision,
      change: { action: "details", summary: "Staff interpretation" },
    },
    applicationWork,
  );
  assert(annotated.status === "ok");
  expect(await getFundingApplicationContent(db, actor, { ...input, materialVersion: 1 })).toEqual(
    original,
  );
  const latest = await getFundingApplicationContent(db, actor, { ...input, materialVersion: 2 });
  assert(latest.status === "ok");
  const saved = JSON.parse(latest.content) as { content: unknown };
  expect(saved.content).toMatchObject({ title: "Updated request" });
  expect(saved.content).not.toHaveProperty("summary");
  expect(saved.content).not.toHaveProperty("summaryAuthor");
  expect(saved.content).not.toHaveProperty("reviews");
  expect(saved.content).not.toHaveProperty("managerRecommendation");
  expect(await getFundingApplicationContent(db, actor, { ...input, materialVersion: 3 })).toEqual({
    status: "not_found",
  });
  expect(await getFundingApplicationContent(db, actor, input)).toEqual({ status: "invalid_range" });
  expect(
    await getFundingApplicationContent(
      db,
      { userId: "birch-manager" },
      { ...input, materialVersion: 1 },
    ),
  ).toEqual({ status: "not_found" });
});

it("projects and clears the linked contact without putting profile data into recorded material", async ({
  db,
}) => {
  const round = await createFundingRound(db, actor, {
    workspaceSlug,
    requestId: randomUUID(),
    title: "Contact projection",
  });
  assert(round.status === "ok");
  const created = await createFundingApplication(db, actor, {
    workspaceSlug,
    publicId: round.publicId,
    requestId: randomUUID(),
    title: "Linked request",
    applicant: "Community group",
  });
  assert(created.status === "ok");
  const contact = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      contactId: randomUUID(),
      action: "create",
      details: { name: "Robin Hale", email: "robin@example.test", affiliation: "" },
    },
    contactWork,
  );
  assert(contact.status === "ok");
  const linkedContact = await editFundingApplication(
    db,
    actor,
    {
      workspaceSlug,
      publicId: created.publicId,
      expectedRevision: 0,
      change: {
        action: "save_content",
        content: { applicant: "Community group (registered)" },
        contactId: contact.contact.id,
      },
    },
    applicationWork,
  );
  assert(linkedContact.status === "ok");
  const input = { workspaceSlug, applicationId: created.publicId };
  const recorded = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "material",
    materialVersion: 2,
  });
  assert(recorded.status === "ok");
  expect(JSON.parse(recorded.content)).toMatchObject({
    content: { submission: { organization: "Community group (registered)" } },
  });
  expect(JSON.parse(recorded.content)).not.toHaveProperty("content.submission.contact");
  expect(JSON.parse(recorded.content)).not.toHaveProperty("content.submission.contactEmail");

  const linked = await getFundingApplicationContent(db, actor, { ...input, section: "submission" });
  assert(linked.status === "ok");
  expect(JSON.parse(linked.content)).toMatchObject({
    contact: "Robin Hale",
    contactEmail: "robin@example.test",
  });

  const cleared = await selectApplicationContact(db, actor, {
    workspaceSlug,
    publicId: created.publicId,
    expectedRevision: linkedContact.revision,
    contactId: null,
  });
  assert(cleared.status === "ok");
  const current = await getFundingApplicationContent(db, actor, {
    ...input,
    section: "submission",
  });
  assert(current.status === "ok");
  expect(JSON.parse(current.content)).not.toHaveProperty("contact");
  expect(JSON.parse(current.content)).not.toHaveProperty("contactEmail");
  expect(
    await getFundingApplicationContent(db, actor, {
      ...input,
      section: "material",
      materialVersion: 2,
    }),
  ).toEqual(recorded);
});
