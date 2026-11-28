import { assert, expect, it, vi } from "vite-plus/test";

import { testOperations } from "../../tests/operations";
import { createAssistantCatalog, type AssistantOperations } from "./catalog";

const workspaceSlug = "alder";
const roundId = "b8q3w5j7c2df";
const applicationId = "k7m2p9x4n6rt";
const requestId = "00000000-0000-4000-a000-000000000001";
const commandId = "00000000-0000-4000-a000-000000000002";
const contactId = "00000000-0000-4000-a000-000000000003";
const assignmentId = "00000000-0000-4000-a000-000000000004";
const assessmentId = "00000000-0000-4000-a000-000000000005";
const fingerprint = "f".repeat(32);
const title = "Community meals";
const details = { name: "Jo", email: "jo@example.test", affiliation: "" };
const draft = { kind: "revision", reason: "Update", content: { title } };
const reasoning = {
  position: "Defer",
  amount: null,
  reasoning: "More detail",
  observations: [],
};
const reviewerDraft = { ...reasoning, note: "" };
const assessmentContent = { ...reasoning, applicationVersion: 8, criteriaVersion: 9, date: null };
const amount = { currency: "EUR", minorUnits: "4000" };

const setup = () => {
  const ops = testOperations();
  const readWorkspace = vi.fn<AssistantOperations["readWorkspace"]>().mockResolvedValue({
    id: "alder-id",
    slug: workspaceSlug,
    name: "Alder",
    kind: "standard",
    role: "program_manager",
    administration: "none",
    canViewTeam: true,
    canWorkOnGrants: true,
    demoExpiresAt: null,
  });
  const partial = { deep: true, partial: true } as const;
  vi.mocked(ops.grantmaking.readRound, partial).mockResolvedValue({
    status: "ok",
    round: { roundId, title: "Round", preparationRevision: 1 },
  });
  vi.mocked(ops.grantmaking.readApplication, partial).mockResolvedValue({
    status: "ok",
    application: {
      applicationId,
      title,
      intakeRevision: 2,
      reviewRevision: 3,
      recommendationRevision: 4,
      decisionRevision: 5,
      applicationVersion: 8,
      criteriaVersion: 9,
    },
  });
  vi.mocked(ops.grantmaking.applicationContent).mockImplementation(async (_, { section }) => {
    const records = {
      working_revision: draft,
      review_request: { contactId, status: "outstanding", reviewer: details.name },
      assessment: { versions: [assessmentContent], reviewer: details.name },
    };
    assert(
      section === "working_revision" || section === "review_request" || section === "assessment",
    );
    const content = JSON.stringify(records[section]);
    return {
      status: "ok",
      format: "json",
      content,
      fingerprint,
      offset: 0,
      nextOffset: null,
      totalCharacters: content.length,
    };
  });
  vi.mocked(ops.contacts.getContact).mockResolvedValue({
    status: "ok",
    contact: { contactId, ...details, contactRevision: 6, archived: false },
  });
  const assignment = {
    id: assignmentId,
    requestId,
    workspaceSlug,
    status: "accepted",
    revision: 7,
    reviewer: details.name,
    applicationTitle: title,
  } as const;
  vi.mocked(ops.reviewer.forApplication, partial).mockResolvedValue({
    status: "ok",
    value: [assignment],
  });
  vi.mocked(ops.grantmaking.listReviews, partial).mockResolvedValue({
    status: "ok",
    reviews: [],
    nextCursor: null,
  });
  vi.mocked(ops.reviewer.read, partial).mockResolvedValue({
    status: "ok",
    value: { assignment, material: {}, draft: { revision: 10 }, assessment: null },
  });
  return createAssistantCatalog(
    { userId: "manager" },
    workspaceSlug,
    { ...ops, readWorkspace },
    "https://merit.test",
  );
};

const record = (kind: string, id: string, version: string) => ({ kind, id, version });

const proposed = (kind: string) => ({ kind, requestId, version: "proposed" });

const round = record("round", roundId, "1");
const intake = record("application", applicationId, "2");
const review = record("application", applicationId, "3");
const contact = record("contact", contactId, "6");
const assignment = record("assignment", assignmentId, "7");
const workingRevision = record("working_revision", applicationId, fingerprint);
const request = record("review_request", requestId, fingerprint);
const reviewerDraftTarget = record("reviewer_draft", assignmentId, "10");

const intakeInput = { applicationId, expectedIntakeRevision: 2 };
const reviewInput = {
  applicationId,
  expectedReviewRevision: 3,
  expectedApplicationVersion: 8,
  expectedCriteriaVersion: 9,
};
const archiveInput = { contactId, expectedContactRevision: 6 };
const assignmentInput = { assignmentId, commandId, expectedRevision: 7 };
const draftInput = { assignmentId, commandId, expectedDraftRevision: 10 };

const example = (
  input: Record<string, unknown>,
  targets: (ReturnType<typeof record> | ReturnType<typeof proposed>)[],
  addedRevisions: Record<string, unknown> = {},
) => ({ input, targets, addedRevisions });

const writes = {
  create_funding_round: example({ requestId, title }, [proposed("round")]),
  edit_funding_round: example({ roundId, change: { section: "details", title } }, [round], {
    expectedPreparationRevision: 1,
  }),
  delete_funding_round: example({ roundId, expectedPreparationRevision: 1 }, [round]),
  create_application: example({ roundId, requestId, title }, [round, proposed("application")]),
  edit_application: example(
    { applicationId, change: { action: "save_content", content: { title }, contactId } },
    [intake, contact],
    { expectedIntakeRevision: 2 },
  ),
  select_application_contact: example({ applicationId, contactId }, [intake, contact], {
    expectedIntakeRevision: 2,
  }),
  start_application_revision: example({ ...intakeInput, kind: "revision" }, [intake]),
  save_application_revision: example({ ...intakeInput, draft, contactId }, [intake, contact]),
  publish_application_revision: example(intakeInput, [intake, workingRevision]),
  discard_application_revision: example(intakeInput, [intake, workingRevision]),
  mark_application_ready: example(intakeInput, [intake]),
  withdraw_application: example(
    { ...intakeInput, withdrawnOn: "2026-10-01", reason: "Withdrawn" },
    [intake],
  ),
  reinstate_application: example({ ...intakeInput, reason: "Reopened" }, [intake]),
  delete_application: example(intakeInput, [intake]),
  create_contact: example({ contactId, details }, [record("contact", contactId, "new")]),
  update_contact: example({ contactId, details }, [contact]),
  archive_contact: example(archiveInput, [contact]),
  restore_contact: example(archiveInput, [contact]),
  request_review: example({ ...reviewInput, id: commandId, contactId, replacesId: null }, [
    review,
    record("review_request", commandId, "new"),
    contact,
  ]),
  cancel_review_request: example({ ...reviewInput, id: requestId }, [review, request, assignment]),
  record_assessment: example(
    {
      ...reviewInput,
      id: assessmentId,
      contactId,
      requestId,
      previousId: null,
      content: assessmentContent,
    },
    [review, record("assessment", assessmentId, "new"), request, contact],
  ),
  correct_assessment: example(
    { ...reviewInput, id: assessmentId, content: assessmentContent, note: "Updated" },
    [review, record("assessment", assessmentId, "1")],
    { expectedAssessmentVersion: 1 },
  ),
  invite_reviewer: example({ applicationId, requestId, commandId, dueDate: null }, [
    intake,
    request,
    contact,
    record("assignment", commandId, "new"),
  ]),
  manage_reviewer_assignment: example(
    { applicationId, ...assignmentInput, action: "cancel", note: "" },
    [intake, assignment, request],
  ),
  respond_to_review: example({ ...assignmentInput, action: "accept", note: "" }, [assignment]),
  save_reviewer_draft: example({ ...draftInput, draft: reviewerDraft }, [
    reviewerDraftTarget,
    assignment,
  ]),
  submit_reviewer_assessment: example(draftInput, [
    reviewerDraftTarget,
    assignment,
    record("assessment", assignmentId, "new"),
  ]),
  save_recommendation: example(
    {
      applicationId,
      expectedApplicationVersion: 8,
      expectedRecommendationRevision: 4,
      expectedCurrentAssessment: { id: assessmentId, version: 1 },
      recommendation: { position: "Fund", allocation: amount, reasoning: "Strong plan" },
    },
    [record("application", applicationId, "4"), record("assessment", assessmentId, "1")],
  ),
  // The assistant assigns the run's identity and binds the application and criteria versions it shows.
  run_ai_review: example(
    { applicationId },
    [record("application", applicationId, "application version 8, criteria version 9")],
    {
      runId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      expectedApplicationVersion: 8,
      expectedCriteriaVersion: 9,
    },
  ),
  record_committee_decision: example(
    {
      applicationId,
      expectedDecisionRevision: 5,
      outcome: "Fund with conditions",
      amount,
      conditions: "Confirm venue",
      reason: "Strong plan",
      decidedBy: "Committee",
      decisionDate: "2026-10-01",
      changeExplanation: "Correction",
    },
    [record("application", applicationId, "5")],
  ),
};

it("exercises every write advertised by the workspace assistant", async () => {
  const tools = await setup().list();
  expect(Object.keys(writes).sort()).toEqual(
    tools
      .filter((tool) => tool.write)
      .map((tool) => tool.name)
      .sort(),
  );
});

it.each(Object.entries(writes))(
  "binds %s to its affected records and revisions",
  async (name, { input, targets, addedRevisions }) => {
    const catalog = setup();
    const { result, preview } = await catalog.preview(name, input);
    expect(result.status).toBe("ok");
    assert(preview);
    expect(preview.targets.map(({ label: _label, ...identity }) => identity)).toEqual(targets);
    const bound = { ...input, workspaceSlug, ...addedRevisions };
    expect(preview.input).toEqual(bound);
    for (const [key, value] of Object.entries(bound)) {
      if (key.startsWith("expected") && typeof value === "number") {
        const stale = await catalog.preview(name, { ...input, [key]: value + 1 });
        expect(stale.result.status, key).toBe("conflict");
        expect(stale.preview).toBeUndefined();
      }
    }
  },
);
