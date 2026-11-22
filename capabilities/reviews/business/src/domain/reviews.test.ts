import { assert, describe, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import {
  emptyReviews,
  hasReviewConflict,
  prepareReviewChange,
  assessmentInputSchema,
  assessmentEntrySchema,
  reviewRevisionSchema,
  type ReviewChange,
  type ReviewState,
} from "./index";

const contactId = "60000000-0000-4000-8000-000000000001";
const requestId = "2c343adf-a49f-50bd-8d8d-6c676aec4bdc";
const assessmentId = "2c92018b-fcad-5d1e-b25c-1fa6430a57af";
const replacementId = "ed39f29d-ef84-57c4-94e1-ae1d14b81159";
const laterId = "71dcd929-d373-5e94-baae-743ccd51f7f6";
const originalId = "8d523318-2362-5ec6-b35e-9506e07da441";
const criteria = [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }];
const context = {
  contact: { id: contactId, name: "Sam", archived: false },
  applicationVersion: materialVersionSchema.parse(1),
  availableVersions: [1, 2].map((version) => materialVersionSchema.parse(version)),
  criteriaVersion: criteriaVersionSchema.parse(1),
  criteriaHistory: [{ version: criteriaVersionSchema.parse(1), criteria }],
  recorder: { userId: "dana", name: "Dana", recordedAt: "2026-11-09T12:00:00Z" },
};
const content = {
  applicationVersion: materialVersionSchema.parse(1),
  criteriaVersion: criteriaVersionSchema.parse(1),
  date: null,
  position: null,
  amount: null,
  reasoning: "Strong demand, venue remains uncertain.",
  observations: [],
};
const request: ReviewChange = { action: "request", id: requestId, contactId, replacesId: null };
const record: ReviewChange = {
  action: "record",
  id: assessmentId,
  contactId,
  requestId: null,
  previousId: null,
  content,
};

const apply = (state: ReviewState, change: ReviewChange) => {
  const result = prepareReviewChange(state, change, context);

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.state;
};

const recordedBy = (authorUserId: string) => {
  const result = prepareReviewChange(emptyReviews(), record, { ...context, authorUserId });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.state;
};

describe("recording reviews", () => {
  it("preserves the authenticated reviewer as an assessment's author", () => {
    expect(recordedBy("sam").assessments[0]?.authorUserId).toBe("sam");
  });

  it.each([
    { editor: "a manager", authorUserId: undefined, note: "" },
    { editor: "another reviewer", authorUserId: "other", note: "Attempt" },
  ])(
    "rejects $editor editing a reviewer-authored assessment without changing it",
    ({ authorUserId, note }) => {
      const source = recordedBy("sam");
      const before = structuredClone(source);

      expect(
        prepareReviewChange(
          source,
          { action: "edit", id: record.id, content: { ...content, reasoning: "Replaced" }, note },
          { ...context, authorUserId },
        ),
      ).toEqual({ ok: false, error: "reviewer_authored" });
      expect(source).toEqual(before);
    },
  );

  it("records the author's amendment as a new version with its note", () => {
    const source = recordedBy("sam");
    const before = structuredClone(source);
    const amended = { ...content, reasoning: "Amended reasoning" };

    const result = prepareReviewChange(
      source,
      { action: "edit", id: record.id, content: amended, note: "Clarified evidence" },
      { ...context, authorUserId: "sam" },
    );

    assert.isTrue(result.ok);
    expect(result.state.revision).toBe(source.revision + 1);
    expect(result.state.assessments[0]?.versions).toEqual([
      ...source.assessments[0]!.versions,
      { content: amended, criteria, recorder: context.recorder, note: "Clarified evidence" },
    ]);
    expect(source).toEqual(before);
  });

  it("rejects a reviewer editing an assessment recorded by a manager", () => {
    const source = apply(emptyReviews(), record);
    const before = structuredClone(source);

    expect(
      prepareReviewChange(
        source,
        {
          action: "edit",
          id: record.id,
          content: { ...content, reasoning: "Reviewer replacement" },
          note: "Replaced",
        },
        { ...context, authorUserId: "sam" },
      ),
    ).toEqual({ ok: false, error: "reviewer_authored" });
    expect(source).toEqual(before);
  });

  it("cancels an outstanding request with its author and advances the revision once", () => {
    const source = apply(emptyReviews(), request);
    const before = structuredClone(source);
    const result = prepareReviewChange(source, { action: "cancel", id: request.id }, context);

    expect(result).toEqual({
      ok: true,
      state: {
        ...source,
        revision: source.revision + 1,
        requests: [{ ...source.requests[0], status: "cancelled", closedBy: context.recorder }],
      },
    });
    expect(source).toEqual(before);
  });

  it.each(["missing", "received", "cancelled"] as const)(
    "rejects cancellation of a %s request without changing the source",
    (status) => {
      const source = apply(emptyReviews(), request);
      source.requests =
        status === "missing" ? [] : source.requests.map((value) => ({ ...value, status }));
      const before = structuredClone(source);

      expect(prepareReviewChange(source, { action: "cancel", id: request.id }, context)).toEqual({
        ok: false,
        error: "request_unavailable",
      });
      expect(source).toEqual(before);
    },
  );

  it("retries an existing request without duplicating it or advancing its revision", () => {
    const source = apply(emptyReviews(), request);
    const before = structuredClone(source);

    expect(prepareReviewChange(source, request, context)).toEqual({ ok: true, state: before });
    expect(source).toEqual(before);
  });

  it.each(["missing", "received", "cancelled"] as const)(
    "rejects replacement of a %s request without creating a new one",
    (status) => {
      const source = apply(emptyReviews(), request);
      source.requests =
        status === "missing" ? [] : source.requests.map((value) => ({ ...value, status }));
      const before = structuredClone(source);

      expect(
        prepareReviewChange(
          source,
          { ...request, id: replacementId, replacesId: request.id },
          context,
        ),
      ).toEqual({ ok: false, error: "request_unavailable" });
      expect(source).toEqual(before);
    },
  );

  it("rejects editing an assessment that does not exist", () => {
    const source = emptyReviews();

    expect(
      prepareReviewChange(
        source,
        { action: "edit", id: crypto.randomUUID(), content, note: "Correction" },
        context,
      ),
    ).toEqual({ ok: false, error: "assessment_unavailable" });
    expect(source).toEqual(emptyReviews());
  });

  it("does not add a version or advance the revision for an unchanged assessment", () => {
    const source = apply(emptyReviews(), record);
    const before = structuredClone(source);

    expect(
      prepareReviewChange(source, { action: "edit", id: record.id, content, note: "" }, context),
    ).toEqual({ ok: true, state: before });
    expect(source).toEqual(before);
  });

  it("records a correction note even when the assessment content is unchanged", () => {
    const source = apply(emptyReviews(), record);
    const before = structuredClone(source);
    const result = prepareReviewChange(
      source,
      { action: "edit", id: record.id, content, note: "Confirmed against the original email." },
      context,
    );

    assert.isTrue(result.ok);
    const assessment = result.state.assessments[0];
    assert.isDefined(assessment);
    expect(assessment.versions).toEqual([
      source.assessments[0]!.versions[0],
      {
        content,
        criteria,
        recorder: context.recorder,
        note: "Confirmed against the original email.",
      },
    ]);
    expect(result.state.revision).toBe(source.revision + 1);
    expect(source).toEqual(before);
  });

  it.each([undefined, { ...context.contact, archived: true }, { ...context.contact, name: " " }])(
    "rejects recording with an unavailable reviewer: %j",
    (contact) => {
      const source = emptyReviews();

      expect(prepareReviewChange(source, record, { ...context, contact })).toEqual({
        ok: false,
        error: "contact_unavailable",
      });
      expect(source).toEqual(emptyReviews());
    },
  );

  it("retries a recorded assessment without duplicating its judgment or history", () => {
    const source = apply(emptyReviews(), record);
    const before = structuredClone(source);

    expect(prepareReviewChange(source, record, context)).toEqual({ ok: true, state: before });
    expect(source).toEqual(before);
  });

  it("marks the reviewer's outstanding request received when recording against it", () => {
    const source = apply(emptyReviews(), request);
    const before = structuredClone(source);

    const state = apply(source, { ...record, requestId: request.id });

    expect(state.requests).toEqual([
      { ...source.requests[0], status: "received", closedBy: context.recorder },
    ]);
    expect(state.assessments[0]?.requestId).toBe(request.id);
    expect(state.revision).toBe(source.revision + 1);
    expect(source).toEqual(before);
  });

  it("records changed assessment content as a new version without requiring a note", () => {
    const source = apply(emptyReviews(), record);
    const corrected = { ...content, reasoning: "Corrected transcription." };

    const state = apply(source, { action: "edit", id: record.id, content: corrected, note: "" });

    expect(state.assessments[0]?.versions).toEqual([
      ...source.assessments[0]!.versions,
      { content: corrected, criteria, recorder: context.recorder, note: "" },
    ]);
    expect(state.revision).toBe(source.revision + 1);
  });

  it("records a follow-up as a separate judgment linked to the reviewer's latest one", () => {
    const source = apply(emptyReviews(), record);
    const later = { ...content, applicationVersion: materialVersionSchema.parse(2) };

    const state = apply(source, { ...record, id: laterId, previousId: record.id, content: later });

    expect(state.assessments).toEqual([
      source.assessments[0],
      {
        id: laterId,
        contactId,
        reviewer: "Sam",
        requestId: null,
        previousId: record.id,
        versions: [{ content: later, criteria, recorder: context.recorder, note: "" }],
      },
    ]);
  });

  it("records an assessment with an unknown evidence basis without creating a request", () => {
    const state = apply(emptyReviews(), {
      ...record,
      content: { ...content, applicationVersion: null, criteriaVersion: null },
    });

    expect(state.assessments[0]?.versions[0]).toMatchObject({
      content: { applicationVersion: null, criteriaVersion: null },
      criteria: null,
    });
    expect(state.requests).toEqual([]);
  });

  it.each([
    { name: "Sam", archived: true },
    { name: "", archived: false },
    { name: "   ", archived: false },
  ])("rejects an ineligible reviewer: %j", (contact) => {
    const request: ReviewChange = { action: "request", id: requestId, contactId, replacesId: null };

    expect(
      prepareReviewChange(emptyReviews(), request, {
        ...context,
        contact: { ...context.contact, ...contact },
      }),
    ).toEqual({ ok: false, error: "contact_unavailable" });
  });

  it("rejects a second outstanding request for the same reviewer", () => {
    const request: ReviewChange = { action: "request", id: requestId, contactId, replacesId: null };
    const state = apply(emptyReviews(), request);

    expect(
      prepareReviewChange(state, { ...request, id: crypto.randomUUID() }, context),
    ).toMatchObject({
      ok: false,
      error: "already_requested",
    });
  });

  it.each(["1.001", "-1", "-0", "-0.0", "-0.00"])(
    "rejects an unsupported assessment amount: %s",
    (amount) => {
      expect(assessmentEntrySchema.safeParse({ ...content, amount }).success).toBe(false);
    },
  );

  it.each([
    "12.30",
    { minorUnits: "-1", currency: "EUR" },
    { minorUnits: "12.30", currency: "EUR" },
    { minorUnits: "1".repeat(31), currency: "EUR" },
    { minorUnits: "0", currency: "USD" },
  ])("rejects a recorded amount outside the EUR minor-unit contract: %j", (amount) => {
    expect(assessmentInputSchema.safeParse({ ...content, amount }).success).toBe(false);
  });

  it("accepts a received assessment without a stated amount or position", () => {
    expect(assessmentInputSchema.safeParse(content).success).toBe(true);
  });

  it.each([
    ["applicationVersion", "version_unavailable"],
    ["criteriaVersion", "criteria_unavailable"],
  ] as const)(
    "rejects an unavailable %s without changing the recorded judgment",
    (field, error) => {
      const source = apply(emptyReviews(), {
        action: "record",
        id: assessmentId,
        contactId,
        requestId: null,
        previousId: null,
        content,
      });
      const before = structuredClone(source);

      expect(
        prepareReviewChange(
          source,
          {
            action: "edit",
            id: assessmentId,
            content: { ...content, [field]: 99 },
            note: "Correction",
          },
          context,
        ),
      ).toEqual({ ok: false, error });
      expect(source).toEqual(before);
    },
  );

  it("does not fulfil another reviewer's request when recording an assessment", () => {
    const source = apply(emptyReviews(), {
      action: "request",
      id: requestId,
      contactId,
      replacesId: null,
    });
    const before = structuredClone(source);
    const other = { id: "other-reviewer", name: "Jules", archived: false };

    expect(
      prepareReviewChange(
        source,
        {
          action: "record",
          id: assessmentId,
          contactId: other.id,
          requestId,
          previousId: null,
          content,
        },
        { ...context, contact: other },
      ),
    ).toEqual({ ok: false, error: "request_unavailable" });
    expect(source).toEqual(before);
  });

  it("requires a follow-up to refer to the reviewer's latest judgment", () => {
    const original = apply(emptyReviews(), {
      action: "record",
      id: originalId,
      contactId,
      requestId: null,
      previousId: null,
      content,
    });
    const source = apply(original, {
      action: "record",
      id: crypto.randomUUID(),
      contactId,
      requestId: null,
      previousId: originalId,
      content: { ...content, reasoning: "Venue is now confirmed." },
    });
    const before = structuredClone(source);

    expect(
      prepareReviewChange(
        source,
        {
          action: "record",
          id: crypto.randomUUID(),
          contactId,
          requestId: null,
          previousId: originalId,
          content,
        },
        context,
      ),
    ).toEqual({ ok: false, error: "follow_up_required" });
    expect(source).toEqual(before);
  });

  it("replaces unfinished work without transferring an earlier assessment to the new reviewer", () => {
    const recorded = apply(emptyReviews(), {
      action: "record",
      id: assessmentId,
      contactId,
      requestId: null,
      previousId: null,
      content,
    });
    const source = apply(recorded, {
      action: "request",
      id: requestId,
      contactId,
      replacesId: null,
    });
    const before = structuredClone(source);
    const replacement = { id: "replacement-reviewer", name: "Jules", archived: false };
    const result = prepareReviewChange(
      source,
      {
        action: "request",
        id: replacementId,
        contactId: replacement.id,
        replacesId: requestId,
      },
      { ...context, contact: replacement },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.state.requests).toEqual([
      { ...source.requests[0], status: "cancelled", closedBy: context.recorder },
      { ...source.requests[0], id: replacementId, contactId: replacement.id, reviewer: "Jules" },
    ]);
    expect(result.state.assessments).toEqual(recorded.assessments);
    expect(result.state.revision).toBe(source.revision + 1);
    expect(source).toEqual(before);
  });

  it.each([
    { position: "Defer", minorUnits: 0, accepted: true },
    { position: "Defer", minorUnits: 1, accepted: false },
    { position: "Decline", minorUnits: 0, accepted: true },
    { position: "Decline", minorUnits: 1, accepted: false },
    { position: "Fund", minorUnits: 1, accepted: true },
    { position: "Fund", minorUnits: 0, accepted: false },
    { position: "Fund with a condition", minorUnits: 0, accepted: false },
    { position: "Fund with a condition", minorUnits: 1, accepted: true },
    { position: null, minorUnits: 0, accepted: true },
  ] as const)(
    "accepts a $position position with $minorUnits minor units: $accepted",
    ({ position, minorUnits, accepted }) => {
      expect(
        assessmentInputSchema.safeParse({
          ...content,
          position,
          amount: encodeMoney(fromMinorUnits(BigInt(minorUnits))),
        }).success,
      ).toBe(accepted);
    },
  );

  describe("criterion observations", () => {
    const criterionId = "20000000-0000-4000-8000-000000000001";
    const note = { criterionId, criterion: "Original wording", text: "Received judgment" };
    const noted = { ...record, content: { ...content, observations: [note] } };

    it("retains a note identified by a criterion from an earlier criteria version", () => {
      const known = {
        ...context,
        criteriaHistory: [
          ...context.criteriaHistory,
          {
            version: criteriaVersionSchema.parse(2),
            criteria: [{ id: criterionId, title: "Renamed" }],
          },
        ],
      };

      expect(prepareReviewChange(emptyReviews(), noted, known)).toMatchObject({
        ok: true,
        state: { assessments: [{ versions: [{ content: { observations: [note] } }] }] },
      });
    });

    it("rejects a note identified by a criterion outside the round's criteria history", () => {
      expect(prepareReviewChange(emptyReviews(), noted, context)).toEqual({
        ok: false,
        error: "criteria_unavailable",
      });
    });

    it("accepts a note without a criterion identity", () => {
      const unidentified = { criterionId: null, criterion: "Unidentified", text: "Keep" };

      expect(
        prepareReviewChange(
          emptyReviews(),
          { ...record, content: { ...content, observations: [unidentified] } },
          context,
        ),
      ).toMatchObject({
        ok: true,
        state: { assessments: [{ versions: [{ content: { observations: [unidentified] } }] }] },
      });
    });

    it("keeps a note's criterion identity when parsing a recorded assessment", () => {
      expect(
        assessmentInputSchema.parse({ ...content, observations: [note] }).observations,
      ).toEqual([note]);
    });
  });
});

describe("target-scoped review conflicts", () => {
  const otherContactId = "60000000-0000-4000-8000-000000000002";
  const otherContext = {
    ...context,
    contact: { id: otherContactId, name: "Jules", archived: false },
  };
  const current = {
    applicationVersion: context.applicationVersion,
    criteriaVersion: context.criteriaVersion,
  };

  // Revision 1: Sam has an outstanding request.
  const requested = () => apply(emptyReviews(), request);

  // Revision 2: Sam's request was cancelled.
  const cancelled = () => apply(requested(), { action: "cancel", id: requestId });

  // Revision 2: Sam's request is still outstanding beside a new request for Jules.
  const withOtherRequest = () => {
    const result = prepareReviewChange(
      requested(),
      { action: "request", id: laterId, contactId: otherContactId, replacesId: null },
      otherContext,
    );
    assert(result.ok);
    return result.state;
  };

  // Revision 2: Sam's request was received with an assessment.
  const recordedOnRequest = () => apply(requested(), { ...record, requestId });

  // Revision 1: Sam's assessment has one version.
  const assessed = () => apply(emptyReviews(), record);

  // Revision 2: Sam's assessment has two versions.
  const amended = () =>
    apply(assessed(), {
      action: "edit",
      id: assessmentId,
      content: { ...content, reasoning: "Updated" },
      note: "v2",
    });

  const julesRequest: ReviewChange = {
    action: "request",
    id: replacementId,
    contactId: otherContactId,
    replacesId: null,
  };

  const edit = (expectedAssessmentVersion?: number): ReviewChange => ({
    action: "edit",
    id: assessmentId,
    ...(expectedAssessmentVersion === undefined ? {} : { expectedAssessmentVersion }),
    content,
    note: "",
  });

  it.each<{
    scenario: string;
    state: () => ReviewState;
    expectedRevision: number;
    change: ReviewChange;
    versions?: Partial<typeof current>;
    conflict: boolean;
  }>([
    {
      scenario: "a baseline ahead of the saved revision",
      state: requested,
      expectedRevision: 5,
      change: { action: "cancel", id: requestId },
      conflict: true,
    },
    {
      scenario: "a stale request for another reviewer",
      state: requested,
      expectedRevision: 0,
      change: julesRequest,
      conflict: false,
    },
    {
      scenario: "a current request for a reviewer whose request is outstanding",
      state: requested,
      expectedRevision: 1,
      change: { action: "request", id: replacementId, contactId, replacesId: null },
      conflict: false,
    },
    {
      scenario: "a stale request for a reviewer whose request is outstanding",
      state: requested,
      expectedRevision: 0,
      change: { action: "request", id: replacementId, contactId, replacesId: null },
      conflict: true,
    },
    {
      scenario: "a stale replacement of a request that was cancelled",
      state: cancelled,
      expectedRevision: 1,
      change: { action: "request", id: replacementId, contactId, replacesId: requestId },
      conflict: true,
    },
    {
      scenario: "a request after the application version advanced",
      state: assessed,
      expectedRevision: 1,
      change: request,
      versions: { applicationVersion: materialVersionSchema.parse(2) },
      conflict: true,
    },
    {
      scenario: "a request after the criteria version advanced",
      state: assessed,
      expectedRevision: 1,
      change: request,
      versions: { criteriaVersion: criteriaVersionSchema.parse(2) },
      conflict: true,
    },
    {
      scenario: "a current cancellation",
      state: requested,
      expectedRevision: 1,
      change: { action: "cancel", id: requestId },
      conflict: false,
    },
    {
      scenario: "a stale cancellation of a request that is still outstanding",
      state: withOtherRequest,
      expectedRevision: 1,
      change: { action: "cancel", id: requestId },
      conflict: false,
    },
    {
      scenario: "a stale cancellation of a request that was already cancelled",
      state: cancelled,
      expectedRevision: 1,
      change: { action: "cancel", id: requestId },
      conflict: true,
    },
    {
      scenario: "a stale record for another reviewer",
      state: requested,
      expectedRevision: 0,
      change: { ...record, id: laterId, contactId: otherContactId },
      conflict: false,
    },
    {
      scenario: "a stale record against a request that is still outstanding",
      state: withOtherRequest,
      expectedRevision: 1,
      change: { ...record, id: laterId, requestId },
      conflict: false,
    },
    {
      scenario: "a stale record against a request that was already received",
      state: recordedOnRequest,
      expectedRevision: 1,
      change: { ...record, id: laterId, requestId },
      conflict: true,
    },
    {
      scenario: "a stale record that does not follow the reviewer's latest assessment",
      state: recordedOnRequest,
      expectedRevision: 1,
      change: { ...record, id: laterId },
      conflict: true,
    },
    {
      scenario: "an edit of the latest assessment version after the versions advanced",
      state: assessed,
      expectedRevision: 1,
      change: edit(1),
      versions: {
        applicationVersion: materialVersionSchema.parse(2),
        criteriaVersion: criteriaVersionSchema.parse(2),
      },
      conflict: false,
    },
    {
      scenario: "a stale edit of the latest assessment version",
      state: amended,
      expectedRevision: 1,
      change: edit(2),
      conflict: false,
    },
    {
      scenario: "an edit of an earlier assessment version",
      state: amended,
      expectedRevision: 1,
      change: edit(1),
      conflict: true,
    },
    {
      scenario: "a current edit without an assessment version",
      state: amended,
      expectedRevision: 2,
      change: edit(),
      conflict: false,
    },
    {
      scenario: "a stale edit without an assessment version",
      state: amended,
      expectedRevision: 1,
      change: edit(),
      conflict: true,
    },
  ])(
    "reports $scenario as conflict: $conflict",
    ({ state, expectedRevision, change, versions, conflict }) => {
      expect(
        hasReviewConflict(
          state(),
          {
            expectedRevision: reviewRevisionSchema.parse(expectedRevision),
            expectedApplicationVersion: current.applicationVersion,
            expectedCriteriaVersion: current.criteriaVersion,
            change,
          },
          { ...current, ...versions },
        ),
      ).toBe(conflict);
    },
  );
});
