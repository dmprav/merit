import { expect, it } from "vite-plus/test";

import { makeApplication } from "@merit/grantmaking/testing/fixtures";

import {
  intakeChange,
  intakeDraftCommand,
  intakeRenameCommand,
  intakeMenuActions,
  newIntakeDraft,
  reconcileIntake,
  type IntakeSnapshot,
} from "./intake-state";
import { intakeStorage } from "./storage";

const baseline: IntakeSnapshot = {
  content: {
    title: "Community meals",
    applicant: "Neighbourhood Kitchen",
    requested: "24000",
    projectPeriod: "Spring 2027",
    answers: [
      {
        questionId: "20d4f45b-11ea-5074-a1b4-8a12c1087f7f",
        question: "Plan",
        response: "Weekly shared meals.",
      },
    ],
  },
  reason: "",
  contactId: null,

  summary: "A local meal programme.",
};

it("sends only the selected section and its contact selection", () => {
  const draft = {
    ...newIntakeDraft("metadata", baseline, 1),
    value: {
      applicant: "Updated applicant",
      requested: "28000",
      projectPeriod: "Summer 2027",
      contactId: "selected-contact",
    },
  };

  expect(intakeChange(draft, null, "")).toEqual({
    action: "save_content",
    contactId: "selected-contact",
    content: {
      applicant: "Updated applicant",
      requested: "28000",
      projectPeriod: "Summer 2027",
    },
  });

  const summary = {
    ...newIntakeDraft("details", baseline, 1),
    value: { summary: "Staff interpretation" },
  };

  expect(intakeChange(summary, null, "")).toEqual({
    action: "details",
    summary: "Staff interpretation",
  });
});

it("keeps locally edited fields and incorporates remote changes when explicitly reconciled", () => {
  const draft = newIntakeDraft("metadata", baseline, 1);
  draft.value.requested = "28000";
  const latest = {
    ...baseline,
    contactId: "new-contact",
    content: { ...baseline.content, applicant: "Corrected applicant", requested: "26000" },
  };
  const reconciled = reconcileIntake(draft, latest, 2);

  expect(reconciled).toMatchObject({
    revision: 2,
    baseline: latest,
    value: { applicant: "Corrected applicant", requested: "28000", contactId: "new-contact" },
  });
  expect(draft.revision).toBe(1);
  expect(draft.baseline).toBe(baseline);
});

it("reconciles submission answers as an ordered list and retains a separately edited reason", () => {
  const draft = newIntakeDraft("content", baseline, 1);
  draft.value.answers = [
    {
      questionId: "572b207b-2c15-5a81-b30d-fb2742580566",
      question: "Local",
      response: "Local response",
    },
  ];
  const latest = {
    ...baseline,
    reason: "Remote explanation",
    content: {
      ...baseline.content,
      answers: [
        {
          questionId: "69c2e5c8-c755-5b25-82db-55efa50e2e41",
          question: "Remote",
          response: "Remote response",
        },
      ],
    },
  };

  expect(reconcileIntake(draft, latest, 2).value.answers).toEqual(draft.value.answers);

  const reason = {
    ...newIntakeDraft("reason", baseline, 1),
    value: { reason: "Local explanation" },
  };

  expect(reconcileIntake(reason, latest, 2).value.reason).toBe("Local explanation");
  expect(
    intakeChange(
      reconcileIntake(draft, latest, 2),
      { kind: "correction", content: latest.content, reason: latest.reason },
      reason.value.reason,
    ),
  ).toMatchObject({
    action: "save_revision",
    draft: {
      kind: "correction",
      reason: "Local explanation",
      content: { answers: draft.value.answers },
    },
  });
});

it.each(["title", "metadata", "content", "details", "reason"] as const)(
  "recovers the current %s draft with its original revision and baseline",
  (section) => {
    const draft = newIntakeDraft(section, baseline, 4);

    expect(intakeStorage.parse(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
  },
);

it("preserves omitted optional fields in unchanged metadata", () => {
  const snapshot = {
    ...baseline,
    contactId: undefined,
    content: { ...baseline.content, projectPeriod: undefined },
  };
  const draft = newIntakeDraft("metadata", snapshot, 1);
  const change = intakeChange(draft, null, "");

  expect(change).toEqual({
    action: "save_content",
    content: { applicant: snapshot.content.applicant, requested: snapshot.content.requested },
  });
  expect(change).not.toHaveProperty("contactId");
});

it("keeps submitted title edits in a revision and starts a correction only when needed", () => {
  const preparing = makeApplication();
  const submitted = makeApplication({ intakeStatus: "ready" });
  const working = { kind: "revision" as const, reason: "New plan", content: baseline.content };

  expect(intakeRenameCommand(preparing, null, "New title")).toMatchObject({
    action: "save_content",
    content: { title: "New title" },
  });
  expect(intakeRenameCommand(submitted, null, "New title")).toEqual({
    action: "start_revision",
    kind: "correction",
  });
  expect(intakeRenameCommand(submitted, working, "New title")).toBeNull();
});

it("rejects a submission save when its shared explanation has a stale baseline", () => {
  const application = makeApplication({ intakeStatus: "ready" });
  const working = { kind: "revision" as const, reason: "Saved reason", content: baseline.content };
  const content = newIntakeDraft("content", baseline, 4);
  const reason = newIntakeDraft("reason", baseline, 3);

  expect(intakeDraftCommand(content, application, working, 4, reason, "Local reason")).toEqual({
    status: "conflict",
  });
  expect(intakeDraftCommand(content, application, null, 4, undefined, "")).toEqual({
    status: "invalid",
    error: "revision_unavailable",
  });
});

it("saves staff details independently of a stale submission explanation", () => {
  const application = makeApplication({ intakeStatus: "ready" });
  const draft = newIntakeDraft("details", baseline, 4);
  draft.value.summary = "Updated staff summary";
  const reason = newIntakeDraft("reason", baseline, 3);

  expect(intakeDraftCommand(draft, application, null, 4, reason, "Local reason")).toEqual({
    status: "ok",
    revision: 4,
    change: {
      action: "details",
      summary: "Updated staff summary",
    },
  });
});

it("offers revision actions according to the submission lifecycle", () => {
  const preparing = makeApplication();
  const submitted = makeApplication({ intakeStatus: "ready" });
  const working = { kind: "correction" as const, reason: "", content: baseline.content };

  expect(intakeMenuActions(preparing, null, false)).toEqual(["delete"]);
  expect(intakeMenuActions(submitted, null, false)).toEqual(["start_revision", "correct"]);
  expect(intakeMenuActions(submitted, working, true)).toEqual(["title", "discard_revision"]);
});

it("preserves question IDs through edits, draft recovery, and repeated command construction", () => {
  const draft = newIntakeDraft("content", baseline, 4);
  const first = draft.value.answers[0]!;
  const originalQuestion = baseline.content.answers[0]!.question;
  first.question = "Renamed";
  expect(draft.baseline.content.answers[0]!.question).toBe(originalQuestion);
  const recovered = intakeStorage.parse(JSON.parse(JSON.stringify(draft)));
  expect(recovered).toEqual(draft);
  expect(intakeChange(recovered as typeof draft, null, "")).toEqual(intakeChange(draft, null, ""));
});

it("rejects draft answers without a question identity", () => {
  const draft = newIntakeDraft("content", baseline, 4);
  expect(() =>
    intakeStorage.parse({
      ...draft,
      value: { answers: [{ question: "Plan", response: "Unfinished" }] },
    }),
  ).toThrow();
});
