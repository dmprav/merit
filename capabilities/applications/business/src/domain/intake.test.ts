import type { ApplicationRecord } from "../../tests/fixtures";
import type { IntakeApplication } from "./model";

type IntakeWithUsage = IntakeApplication &
  Partial<Pick<ApplicationRecord, "reviews" | "managerRecommendation">>;

const usage = (application: IntakeWithUsage) => ({
  hasReviews: Boolean(
    application.reviews?.requests.length || application.reviews?.assessments.length,
  ),
  hasRecommendation: application.managerRecommendation != null,
});

const prepareIntakeChange = (
  application: IntakeWithUsage,
  ...args: [
    Parameters<typeof prepareIntakeCommand>[1],
    Parameters<typeof prepareIntakeCommand>[2],
    Parameters<typeof prepareIntakeCommand>[3],
  ]
) => {
  const result = prepareIntakeCommand(application, ...args, usage(application));
  return result;
};

import { describe, expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makeApplication, makeReviewedApplication } from "../../tests/fixtures";
import {
  intakeContent,
  intakeContentSchema,
  intakeChangeSchema,
  missingIntakeFields,
  prepareIntakeChange as prepareIntakeCommand,
  canDeleteApplication as canDeleteCase,
  canEditIntakeContent,
  isWithdrawn,
  latestWithdrawalDate,
  type WorkingRevision,
} from "./index";

const author = { userId: "dana", name: "Dana Reed", recordedAt: "2026-11-09T12:00:00Z" };
const completed = {
  title: "Neighbour Table",
  applicant: "Neighbourhood Kitchen",
  requested: "24000.00",
  answers: [
    {
      questionId: "10000000-0000-4000-8000-000000000001",
      question: "Project",
      response: "Weekly community meals.",
    },
  ],
};

describe("application intake", () => {
  it("accepts a supplied partial edit and rejects an edit containing only undefined fields", () => {
    expect(
      intakeChangeSchema.parse({ action: "save_content", content: { title: " Renamed " } }),
    ).toEqual({
      action: "save_content",
      content: { title: "Renamed" },
    });
    expect(
      intakeChangeSchema.safeParse({ action: "save_content", content: { title: undefined } })
        .success,
    ).toBe(false);
  });

  it("reports all missing readiness fields when no submission has been recorded", () => {
    const application = makeApplication({ title: " ", submission: undefined });

    expect(missingIntakeFields(intakeContent(application))).toEqual([
      "title",
      "applicant",
      "requested",
      "answers",
    ]);
  });

  it.each([
    { status: "in_preparation", hasDraft: false, allowed: true },
    { status: "ready", hasDraft: false, allowed: false },
    { status: "ready", hasDraft: true, allowed: true },
  ] as const)(
    "allows intake editing for $status with draft=$hasDraft: $allowed",
    ({ status, hasDraft, allowed }) => {
      const draft: WorkingRevision = { kind: "revision", reason: "Update", content: completed };

      expect(canEditIntakeContent({ intakeStatus: status }, hasDraft ? draft : null)).toBe(allowed);
    },
  );

  it("clears a requested amount to unknown while preserving the original submission", () => {
    const application = makeApplication({ requested: fromMinorUnits(10000n) });
    const before = structuredClone(application);

    expect(
      prepareIntakeChange(
        application,
        null,
        { action: "save_content", content: { requested: "" } },
        author,
      ),
    ).toMatchObject({
      ok: true,
      application: {
        requested: null,
        version: application.version + 1,
        submission: { version: application.version + 1, answers: application.submission!.answers },
      },
    });
    expect(application).toEqual(before);
  });

  it("leaves the evidence version unchanged when an intake save changes no content", () => {
    const application = makeApplication();
    const before = structuredClone(application);

    expect(
      prepareIntakeChange(
        application,
        null,
        { action: "save_content", content: { title: application.title } },
        author,
      ),
    ).toEqual({
      ok: true,
      application,
      workingRevision: null,
      action: "save_content",
      reason: null,
    });
    expect(application).toEqual(before);
  });

  it("keeps the material version when a save only changes text spacing and amount formatting", () => {
    const application = makeApplication({ requested: fromMinorUnits(2400000n) });
    const before = structuredClone(application);

    expect(
      prepareIntakeChange(
        application,
        null,
        {
          action: "save_content",
          content: { title: ` ${application.title} `, requested: "24000" },
        },
        author,
      ),
    ).toEqual({
      ok: true,
      application: before,
      workingRevision: null,
      action: "save_content",
      reason: null,
    });
    expect(application).toEqual(before);
  });

  it.each([null, { kind: "correction", reason: "Correction", content: completed }] as const)(
    "rejects saving a revision when the matching working draft is unavailable: %j",
    (working) => {
      const application = makeReviewedApplication();
      const before = structuredClone(application);
      const draftBefore = structuredClone(working);
      const draft = { kind: "revision" as const, reason: "Update", content: { title: "Revised" } };

      expect(
        prepareIntakeChange(
          application,
          working,
          {
            action: "save_revision",
            draft,
          },
          author,
        ),
      ).toEqual({
        ok: false,
        error: "revision_unavailable",
      });
      expect(application).toEqual(before);
      expect(working).toEqual(draftBefore);
    },
  );

  it("keeps recorded evidence and the working draft when publishing incomplete content", () => {
    const application = makeReviewedApplication();
    const before = structuredClone(application);
    const draft: WorkingRevision = {
      kind: "revision",
      reason: "New plan",
      content: { ...completed, requested: "" },
    };
    const draftBefore = structuredClone(draft);

    expect(prepareIntakeChange(application, draft, { action: "publish_revision" }, author)).toEqual(
      {
        ok: false,
        error: "incomplete_application",
      },
    );
    expect(application).toEqual(before);
    expect(draft).toEqual(draftBefore);
  });

  it("permits deletion of unused preparation without changing its content", () => {
    const application = makeApplication();
    const before = structuredClone(application);

    expect(prepareIntakeChange(application, null, { action: "delete" }, author)).toEqual({
      ok: true,
      application,
      workingRevision: null,
      action: "delete",
      reason: null,
    });
    expect(application).toEqual(before);
  });

  it("preserves the original author when a staff summary is saved unchanged", () => {
    const originalAuthor = { ...author, userId: "sam", name: "Sam" };
    const application = makeApplication({
      summary: "Recorded interpretation",
      summaryAuthor: originalAuthor,
    });
    const before = structuredClone(application);

    expect(
      prepareIntakeChange(
        application,
        null,
        { action: "details", summary: application.summary },
        author,
      ),
    ).toEqual({ ok: true, application, workingRevision: null, action: "details", reason: null });
    expect(application).toEqual(before);
  });

  it("changes only supplied intake fields and keeps submitted evidence on a rename", () => {
    const application = makeApplication({
      requested: fromMinorUnits(2400000n),
      submission: {
        version: 1,
        organization: "Neighbourhood Kitchen",
        contact: "Sam",
        contactEmail: "sam@example.test",
        projectPeriod: "Summer 2027",
        answers: completed.answers,
      },
    });
    const result = prepareIntakeChange(
      application,
      null,
      {
        action: "save_content",
        content: { title: "New title" },
      },
      author,
    );
    expect(result).toMatchObject({
      ok: true,
      application: {
        title: "New title",
        requested: application.requested,
        submission: { ...application.submission, version: application.version + 1 },
      },
    });
  });

  it("rejects an intake edit with no supplied fields", () => {
    expect(intakeChangeSchema.safeParse({ action: "save_content", content: {} }).success).toBe(
      false,
    );
  });

  it("rejects a contact change supplied as a staff-details edit", () => {
    expect(
      intakeChangeSchema.safeParse({ action: "details", summary: "Summary", contact: "Sam" })
        .success,
    ).toBe(false);
  });

  it("merges a partial working revision into the saved draft rather than the published submission", () => {
    const application = makeReviewedApplication();
    const working: WorkingRevision = {
      kind: "revision",
      reason: "Expanded plan",
      content: { ...completed, projectPeriod: "Summer 2027" },
    };
    expect(
      prepareIntakeChange(
        application,
        working,
        {
          action: "save_revision",
          draft: {
            kind: "revision",
            reason: working.reason,
            content: { requested: "28000", projectPeriod: "" },
          },
        },
        author,
      ),
    ).toMatchObject({
      ok: true,
      application,
      workingRevision: {
        ...working,
        content: { ...working.content, requested: "28000.00", projectPeriod: "" },
      },
    });
  });

  it("requires a working revision to change ready evidence", () => {
    const application = makeReviewedApplication();
    const before = structuredClone(application);

    expect(
      prepareIntakeChange(
        application,
        null,
        { action: "save_content", content: completed },
        author,
      ),
    ).toEqual({ ok: false, error: "revision_required" });
    expect(application).toEqual(before);
  });

  it("rejects publishing when there is no working revision", () => {
    expect(
      prepareIntakeChange(makeReviewedApplication(), null, { action: "publish_revision" }, author),
    ).toEqual({ ok: false, error: "revision_unavailable" });
  });

  it("preserves an existing draft when another revision is requested", () => {
    const application = makeReviewedApplication();
    const draft: WorkingRevision = { kind: "correction", reason: "Correction", content: completed };
    const before = structuredClone(draft);

    expect(
      prepareIntakeChange(
        application,
        draft,
        { action: "start_revision", kind: "revision" },
        author,
      ),
    ).toEqual({ ok: false, error: "revision_unavailable" });
    expect(draft).toEqual(before);
  });

  it("rejects recording an unchanged revision", () => {
    const application = makeReviewedApplication();
    const draft: WorkingRevision = {
      kind: "revision",
      reason: "No actual changes",
      content: intakeContent(application),
    };

    expect(prepareIntakeChange(application, draft, { action: "publish_revision" }, author)).toEqual(
      {
        ok: false,
        error: "unchanged_revision",
      },
    );
  });

  it("rejects an equivalent revision that omits the recorded project period", () => {
    const application = makeApplication({
      intakeStatus: "ready",
      title: completed.title,
      requested: fromMinorUnits(2400000n),
      submission: {
        version: 1,
        organization: completed.applicant,
        projectPeriod: "Summer 2027",
        answers: completed.answers,
      },
    });
    const draft: WorkingRevision = {
      kind: "revision",
      reason: "Reformatted material",
      content: { ...completed, title: ` ${completed.title} `, requested: "24000" },
    };
    const before = structuredClone(application);
    const draftBefore = structuredClone(draft);

    expect(prepareIntakeChange(application, draft, { action: "publish_revision" }, author)).toEqual(
      {
        ok: false,
        error: "unchanged_revision",
      },
    );
    expect(application).toEqual(before);
    expect(draft).toEqual(draftBefore);
  });

  it("discards a draft without changing recorded evidence or judgments", () => {
    const application = makeReviewedApplication();
    const draft: WorkingRevision = { kind: "revision", reason: "Update", content: completed };

    expect(prepareIntakeChange(application, draft, { action: "discard_revision" }, author)).toEqual(
      {
        ok: true,
        application,
        workingRevision: null,
        action: "discard_revision",
        reason: null,
      },
    );
  });

  it("rejects deletion of a reviewed application", () => {
    const application = makeReviewedApplication();
    const before = structuredClone(application);

    expect(prepareIntakeChange(application, null, { action: "delete" }, author)).toEqual({
      ok: false,
      error: "application_in_use",
    });
    expect(application).toEqual(before);
  });

  it("reports missing applicant, amount and answers on an empty intake", () => {
    expect(missingIntakeFields(intakeContent(makeApplication()))).toEqual([
      "applicant",
      "requested",
      "answers",
    ]);
  });

  it("accepts an explicitly zero requested amount for readiness", () => {
    expect(missingIntakeFields({ ...completed, requested: "0" })).toEqual([]);
  });

  it("allows readiness only after complete material has been recorded", () => {
    const application = makeApplication();

    expect(prepareIntakeChange(application, null, { action: "mark_ready" }, author)).toMatchObject({
      ok: false,
      error: "incomplete_application",
    });
    const saved = prepareIntakeChange(
      application,
      null,
      { action: "save_content", content: completed },
      author,
    );

    if (!saved.ok) {
      throw new Error("Expected save");
    }
    expect(
      prepareIntakeChange(saved.application, null, { action: "mark_ready" }, author),
    ).toMatchObject({ ok: true, application: { intakeStatus: "ready" } });
  });

  it.each(["correction", "revision"] as const)(
    "keeps a %s separate, requires a reason, and preserves old judgments on recording",
    (kind) => {
      const application = makeReviewedApplication();
      const started = prepareIntakeChange(
        application,
        null,
        { action: "start_revision", kind },
        author,
      );

      if (!started.ok || !started.workingRevision) {
        throw new Error("Expected working revision");
      }

      const draft = {
        ...started.workingRevision,
        content: { ...started.workingRevision.content, requested: "28000" },
      };
      const saved = prepareIntakeChange(
        application,
        started.workingRevision,
        {
          action: "save_revision",
          draft: { ...draft, content: { requested: draft.content.requested } },
        },
        author,
      );

      expect(saved).toMatchObject({ ok: true, application });
      expect(
        prepareIntakeChange(application, draft, { action: "publish_revision" }, author),
      ).toMatchObject({ ok: false, error: "reason_required" });

      const recorded = prepareIntakeChange(
        application,
        { ...draft, reason: "Venue costs changed." },
        { action: "publish_revision" },
        author,
      );

      if (!recorded.ok) {
        throw new Error("Expected recording");
      }
      expect(recorded).toMatchObject({ action: kind, reason: "Venue costs changed." });
      expect(recorded.application.version).toBe(application.version + 1);
      expect(recorded.application).toMatchObject({
        managerRecommendation: application.managerRecommendation,
      });
      expect(recorded.workingRevision).toBeNull();

      expect(recorded.application).toMatchObject({ reviews: application.reviews });
      expect(application.requested).toEqual(fromMinorUnits(2400000n));
    },
  );

  it("attributes a staff summary without changing submitted evidence", () => {
    const application = makeReviewedApplication();
    const result = prepareIntakeChange(
      application,
      null,
      {
        action: "details",
        summary: "Staff interpretation.",
      },
      author,
    );

    expect(result).toMatchObject({
      ok: true,
      application: {
        version: application.version,
        summaryAuthor: author,
        submission: application.submission,
      },
    });
  });

  it.each([
    { intakeStatus: "in_preparation", hasReviews: false, hasRecommendation: false, allowed: true },
    { intakeStatus: "in_preparation", hasReviews: true, hasRecommendation: false, allowed: false },
    { intakeStatus: "in_preparation", hasReviews: false, hasRecommendation: true, allowed: false },
    { intakeStatus: "ready", hasReviews: false, hasRecommendation: false, allowed: false },
  ] as const)(
    "allows deletion of a $intakeStatus application with reviews=$hasReviews and recommendation=$hasRecommendation: $allowed",
    ({ intakeStatus, hasReviews, hasRecommendation, allowed }) => {
      expect(canDeleteCase({ intakeStatus }, { hasReviews, hasRecommendation })).toBe(allowed);
    },
  );

  it("does not start a revision of an application still in preparation", () => {
    expect(
      prepareIntakeChange(
        makeApplication(),
        null,
        { action: "start_revision", kind: "revision" },
        author,
      ),
    ).toEqual({ ok: false, error: "revision_unavailable" });
  });

  it("requires a response on a submitted answer", () => {
    expect(
      missingIntakeFields({
        ...completed,
        answers: [
          {
            questionId: "c0e44ab1-70fd-5f71-b96e-98f7b547f485",
            question: "Project",
            response: " ",
          },
        ],
      }),
    ).toEqual(["answers"]);
  });

  it.each(["1.001", "-1", "NaN", "1e3"])("rejects requested amount %s", (requested) => {
    expect(intakeContentSchema.safeParse({ ...completed, requested }).success).toBe(false);
  });

  it("requires a heading on a submitted answer", () => {
    expect(
      missingIntakeFields({
        ...completed,
        answers: [
          { questionId: "c0e44ab1-70fd-5f71-b96e-98f7b547f485", question: "", response: "Text" },
        ],
      }),
    ).toEqual(["answers"]);
  });
});

describe("withdrawal", () => {
  const ready = () =>
    makeApplication({
      intakeStatus: "ready",
      requested: fromMinorUnits(2400000n),
      submission: { version: 1, organization: "Neighbourhood Kitchen", answers: [] },
    });

  const withdraw = {
    action: "withdraw",
    withdrawnOn: "2026-11-08",
    reason: "The applicant secured other funding.",
  } as const;
  const working: WorkingRevision = {
    kind: "revision",
    reason: "Updated plan",
    content: intakeContent(ready()),
  };

  it.each([
    ["in preparation", makeApplication(), null],
    ["ready", ready(), null],
    ["ready with a working revision", ready(), working],
  ])("records the withdrawal and keeps the retained work when %s", (_name, application, draft) => {
    const result = prepareIntakeChange(application, draft, withdraw, author);

    expect(result).toMatchObject({
      ok: true,
      action: "withdraw",
      reason: "The applicant secured other funding.",
      workingRevision: draft,
    });
    if (!result.ok) {
      return;
    }
    expect(result.application.withdrawal).toEqual({
      withdrawnOn: "2026-11-08",
      reason: "The applicant secured other funding.",
      recorder: author,
    });
    expect(result.application).toEqual({
      ...application,
      withdrawal: result.application.withdrawal,
    });
    expect(result.application.version).toBe(application.version);
    expect(isWithdrawn(result.application)).toBe(true);
  });

  it("accepts today and earlier dates but rejects a date after the server's date", () => {
    for (const withdrawnOn of ["2026-11-09", "2020-01-01"]) {
      expect(prepareIntakeChange(ready(), null, { ...withdraw, withdrawnOn }, author).ok).toBe(
        true,
      );
    }
    expect(
      prepareIntakeChange(ready(), null, { ...withdraw, withdrawnOn: "2026-11-11" }, author),
    ).toEqual({
      ok: false,
      error: "withdrawal_date_in_future",
    });
  });

  it("accepts the date a person ahead of the server's time zone calls today", () => {
    // 23:30 UTC on 9 November is already 10 November at UTC+1 through UTC+14.
    const late = { ...author, recordedAt: "2026-11-09T23:30:00Z" };

    expect(
      prepareIntakeChange(ready(), null, { ...withdraw, withdrawnOn: "2026-11-10" }, late).ok,
    ).toBe(true);
    expect(latestWithdrawalDate("2026-11-09T09:59:59Z")).toBe("2026-11-09");
    expect(latestWithdrawalDate("2026-11-09T10:00:00Z")).toBe("2026-11-10");
    expect(
      prepareIntakeChange(ready(), null, { ...withdraw, withdrawnOn: "2026-11-11" }, late),
    ).toEqual({ ok: false, error: "withdrawal_date_in_future" });
  });

  it.each(["", "   "])("requires a reason: %j", (reason) => {
    expect(intakeChangeSchema.safeParse({ ...withdraw, reason }).success).toBe(false);
    expect(intakeChangeSchema.safeParse({ action: "reinstate", reason }).success).toBe(false);
  });

  it("trims the reason and limits it to the reviewer resolution length", () => {
    expect(intakeChangeSchema.parse({ ...withdraw, reason: "  Stepped back  " })).toMatchObject({
      reason: "Stepped back",
    });
    expect(intakeChangeSchema.safeParse({ ...withdraw, reason: "x".repeat(2000) }).success).toBe(
      true,
    );
    expect(intakeChangeSchema.safeParse({ ...withdraw, reason: "x".repeat(2001) }).success).toBe(
      false,
    );
  });

  it("rejects withdrawing a withdrawn application", () => {
    const withdrawn = prepareIntakeChange(ready(), null, withdraw, author);
    expect(
      withdrawn.ok && prepareIntakeChange(withdrawn.application, null, withdraw, author),
    ).toEqual({
      ok: false,
      error: "application_withdrawn",
    });
  });

  it("restores the retained state and working revision on reinstatement", () => {
    const withdrawn = prepareIntakeChange(ready(), working, withdraw, author);
    if (!withdrawn.ok) {
      throw new Error("Expected a withdrawal");
    }
    const result = prepareIntakeChange(
      withdrawn.application,
      withdrawn.workingRevision,
      { action: "reinstate", reason: "The applicant returned." },
      author,
    );

    expect(result).toMatchObject({
      ok: true,
      action: "reinstate",
      reason: "The applicant returned.",
      application: ready(),
      workingRevision: working,
    });
  });

  it("rejects reinstating an application that is not withdrawn", () => {
    expect(
      prepareIntakeChange(ready(), null, { action: "reinstate", reason: "Back" }, author),
    ).toEqual({ ok: false, error: "application_not_withdrawn" });
  });

  it.each([
    { action: "save_content", content: { title: "Changed" } },
    { action: "start_revision", kind: "revision" },
    {
      action: "save_revision",
      draft: { kind: "revision", reason: "", content: { title: "Changed" } },
    },
    { action: "publish_revision" },
    { action: "discard_revision" },
    { action: "mark_ready" },
    { action: "delete" },
    { action: "details", summary: "Changed" },
    withdraw,
  ] as const)("rejects $action while withdrawn", (change) => {
    const withdrawn = prepareIntakeChange(makeApplication(), working, withdraw, author);
    if (!withdrawn.ok) {
      throw new Error("Expected a withdrawal");
    }

    expect(prepareIntakeChange(withdrawn.application, working, change, author)).toEqual({
      ok: false,
      error: "application_withdrawn",
    });
    expect(canDeleteCase(withdrawn.application, usage(withdrawn.application))).toBe(false);
    expect(canEditIntakeContent(withdrawn.application, working)).toBe(false);
  });
});

it("preserves submitted budget answers unchanged through a revision", () => {
  const budgetAnswer = {
    questionId: "934b7d5b-253c-5308-8a6a-2cd276004967",
    question: "Budget",
    response: "Food and supplies: €9600.00",
  };
  const application = makeApplication({
    intakeStatus: "ready",
    requested: fromMinorUnits(2400000n),
    submission: { version: 1, organization: "Neighbourhood Kitchen", answers: [budgetAnswer] },
  });
  const content = intakeContent(application);
  const result = prepareIntakeChange(
    application,
    { kind: "revision", reason: "New amount", content: { ...content, requested: "28000.00" } },
    { action: "publish_revision" },
    author,
  );

  if (!result.ok) {
    throw new Error("Expected revision");
  }
  expect(result.application.submission?.answers.at(-1)).toEqual(budgetAnswer);
  expect(application.submission?.answers.at(-1)).toEqual(budgetAnswer);
});

it("requires unique question identities in saved content and writes", () => {
  const questionId = "10000000-0000-4000-8000-000000000001";
  const answer = { questionId, question: "Repeated heading", response: "First response" };
  const change = { action: "save_content", content: { answers: [answer] } };
  expect(intakeChangeSchema.safeParse(change).success).toBe(true);
  expect(
    intakeChangeSchema.safeParse({ ...change, content: { answers: [answer, answer] } }).success,
  ).toBe(false);
  expect(
    intakeChangeSchema.safeParse({
      ...change,
      content: { answers: [{ question: "Old heading", response: "Old answer" }] },
    }).success,
  ).toBe(false);
  expect(
    intakeContentSchema.safeParse({
      title: "Case",
      applicant: "Group",
      requested: "",
      answers: [answer],
    }).success,
  ).toBe(true);
  expect(
    intakeContentSchema.safeParse({
      title: "Case",
      applicant: "Group",
      requested: "",
      answers: [answer, answer],
    }).success,
  ).toBe(false);
});
