import { randomUUID } from "node:crypto";

import { assert, expect } from "vite-plus/test";

import { getFundingApplicationPage, getFundingRoundPage } from "@merit/grantmaking/server";
import { encodeMoney } from "@merit/money";
import { actor } from "@merit/organizations/testing/workspace";

import { transportTest as it } from "./fixtures/transport-test";

it("completes grant work through MCP with shared web state, safe retries, and verified provenance", async ({
  db,
  database,
  rounds: { pageInput },
  transport: { callMcp },
}) => {
  const invoke = (name: string, args: Record<string, unknown>) => callMcp(actor.userId, args, name);

  const saved = async (name: string, args: Record<string, unknown>) => {
    const result = await invoke(name, args);

    expect(result.isError, JSON.stringify(result)).toBe(false);

    return result.structuredContent as Record<string, unknown>;
  };

  expect((await saved("list_workspaces", {})).workspaces).toMatchObject([{ slug: "alder" }]);
  expect((await saved("list_funding_rounds", { workspaceSlug: "alder" })).rounds).toMatchObject([
    { roundId: pageInput.publicId },
  ]);

  const creation = {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    title: "MCP parity",
    budget: "1000.50",
  };
  const created = await saved("create_funding_round", creation);

  expect(await saved("create_funding_round", creation)).toEqual(created);

  const address = { workspaceSlug: "alder", roundId: String(created.roundId) };
  const webAddress = { workspaceSlug: "alder", publicId: address.roundId };
  await saved("edit_funding_round", {
    ...address,
    expectedPreparationRevision: 0,
    change: { section: "budget", amount: "2000.50", reason: "Additional funding" },
  });
  const webRound = (await getFundingRoundPage(db, actor, { ...webAddress, kind: "round" }))!;

  expect(encodeMoney(webRound.round.budget!)).toEqual({ minorUnits: "200050", currency: "EUR" });
  expect(webRound.preparation.budgetHistory[0]).toMatchObject({
    actor: "Dana Reed",
    provenance: { interface: "mcp", clientId: "integration-client" },
  });
  expect(
    (
      await invoke("edit_funding_round", {
        ...address,
        expectedPreparationRevision: 0,
        change: { section: "budget", amount: "1", reason: "Stale" },
      })
    ).structuredContent,
  ).toEqual({ status: "conflict" });

  const application = await saved("create_application", {
    ...address,
    requestId: randomUUID(),
    title: "Neighbourhood meals",
    applicant: "Neighbours",
    requested: "500",
    answers: [
      {
        questionId: "f301188e-917d-5368-9a3b-889052b56073",
        question: "Purpose",
        response: "Weekly shared meals",
      },
    ],
  });
  const applicationAddress = {
    workspaceSlug: "alder",
    applicationId: String(application.applicationId),
  };
  const webApplicationAddress = {
    workspaceSlug: "alder",
    publicId: applicationAddress.applicationId,
  };
  const contactId = randomUUID();
  await saved("create_contact", {
    workspaceSlug: "alder",
    contactId,
    details: { name: "Sam", email: "sam@example.test", affiliation: "" },
  });
  const contacts = await saved("list_contacts", { workspaceSlug: "alder" });

  expect(contacts.contacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ contactId })]),
  );
  expect(
    (await saved("list_contact_history", { workspaceSlug: "alder", contactId })).entries,
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        provenance: { interface: "mcp", clientId: "integration-client" },
      }),
    ]),
  );

  await saved("select_application_contact", {
    ...applicationAddress,
    expectedIntakeRevision: 0,
    contactId,
  });
  await saved("mark_application_ready", {
    ...applicationAddress,
    expectedIntakeRevision: 1,
  });
  let page = (await getFundingApplicationPage(db, actor, webApplicationAddress))!;
  const requestId = randomUUID();
  const reviewRequest = {
    ...applicationAddress,
    expectedReviewRevision: 0,
    expectedApplicationVersion: page.application.version,
    expectedCriteriaVersion: page.round.criteriaVersion,
    id: requestId,
    contactId,
    replacesId: null,
  };
  await saved("request_review", reviewRequest);
  await saved("request_review", reviewRequest);
  await saved("record_assessment", {
    ...applicationAddress,
    expectedApplicationVersion: page.application.version,
    expectedCriteriaVersion: page.round.criteriaVersion,
    expectedReviewRevision: 1,
    id: randomUUID(),
    contactId,
    requestId,
    previousId: null,
    content: {
      applicationVersion: page.application.version,
      criteriaVersion: page.round.criteriaVersion,
      date: "2026-11-09",
      position: "Fund",
      amount: "400",
      reasoning: "Clear local benefit",
      observations: [],
    },
  });
  page = (await getFundingApplicationPage(db, actor, webApplicationAddress))!;

  expect(page.application.reviews.requests).toHaveLength(1);
  expect(
    (
      page.application.reviews.assessments[0] ??
      assert.fail("Expected page.application.reviews.assessments[0]")
    ).versions[0]?.recorder,
  ).toMatchObject({
    userId: "dana",
    provenance: { interface: "mcp", clientId: "integration-client" },
  });

  await saved("save_recommendation", {
    ...applicationAddress,
    expectedRecommendationRevision: page.recommendationVersion,
    expectedApplicationVersion: page.application.version,
    recommendation: {
      position: "Fund",
      allocation: { minorUnits: "40000", currency: "EUR" },
      reasoning: "Support the shared meals",
      author: { name: "Spoofed", provenance: { interface: "web" } },
    },
  });
  page = (await getFundingApplicationPage(db, actor, webApplicationAddress))!;

  expect(page.application.managerRecommendation!.author).toMatchObject({
    name: "Dana Reed",
    provenance: { interface: "mcp", clientId: "integration-client" },
  });

  await saved("start_application_revision", {
    ...applicationAddress,
    expectedIntakeRevision: page.intake.revision,
    kind: "correction",
  });
  const mcpApplication = await saved("get_application", applicationAddress);

  expect(mcpApplication.application).toMatchObject({ hasWorkingRevision: true });
  const working = await saved("get_application_content", {
    ...applicationAddress,
    section: "working_revision",
  });
  expect(JSON.parse(String(working.content))).toMatchObject({ kind: "correction" });
  const history = await saved("list_application_history", {
    ...applicationAddress,
    history: "intake",
  });
  expect(history.entries).toEqual(
    expect.arrayContaining([expect.objectContaining({ action: "start_revision" })]),
  );
  const refreshed = (await getFundingApplicationPage(db, actor, webApplicationAddress))!;
  expect(mcpApplication.application).toMatchObject({
    applicationVersion: refreshed.application.version,
    intakeRevision: refreshed.intake.revision,
    recommendationRevision: refreshed.recommendationVersion,
  });
  const mcpRound = await saved("get_funding_round", address);
  expect(mcpRound.round).toMatchObject({
    totals: { proposed: { minorUnits: "40000", currency: "EUR" } },
  });

  const audit = await database.client.query(
    "SELECT provenance FROM recommendation_versions WHERE case_id=$1",
    [applicationAddress.applicationId],
  );

  expect(audit.rows).toEqual([
    { provenance: { interface: "mcp", clientId: "integration-client" } },
  ]);
  const mcpProvenance = { interface: "mcp", clientId: "integration-client" };
  expect(
    (
      await database.client.query(
        "SELECT actor_user_id, provenance, action, target_type, target_revision FROM audit_events WHERE target_id=$1 ORDER BY action",
        [applicationAddress.applicationId],
      )
    ).rows,
  ).toEqual([
    {
      actor_user_id: "dana",
      provenance: mcpProvenance,
      action: "application.create",
      target_type: "application",
      target_revision: 0,
    },
    {
      actor_user_id: "dana",
      provenance: mcpProvenance,
      action: "application.mark_ready",
      target_type: "application",
      target_revision: 2,
    },
    {
      actor_user_id: "dana",
      provenance: mcpProvenance,
      action: "recommendation.saved",
      target_type: "recommendation",
      target_revision: 1,
    },
  ]);

  // The same events, newest first, are what a program manager catches up on.
  const activity = await saved("list_workspace_activity", { workspaceSlug: "alder" });
  expect(activity.nextCursor).toBeNull();
  expect(activity.entries).toMatchObject([
    {
      action: "recommendation.saved",
      actor: "Dana Reed",
      provenance: mcpProvenance,
      record: {
        kind: "application",
        id: applicationAddress.applicationId,
        url: `http://localhost:3000/app/alder/applications/${applicationAddress.applicationId}`,
      },
    },
    { action: "assessment.recorded", provenance: mcpProvenance },
    { action: "application.mark_ready" },
    { action: "application.create" },
    { action: "round.budget", record: { kind: "round", id: address.roundId } },
    { action: "round.create", record: { kind: "round", id: address.roundId } },
    { action: "round.create", record: { kind: "round", id: pageInput.publicId } },
  ]);

  await database.client.query("DELETE FROM memberships WHERE user_id='dana'");

  expect((await invoke("get_application", applicationAddress)).structuredContent).toEqual({
    status: "not_found",
  });
  expect(
    (
      await invoke("edit_funding_round", {
        ...address,
        expectedPreparationRevision: 1,
        change: { section: "budget", amount: "3000", reason: "Revoked user" },
      })
    ).structuredContent,
  ).toEqual({ status: "not_found" });
});
