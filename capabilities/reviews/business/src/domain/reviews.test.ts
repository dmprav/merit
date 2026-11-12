import { assert, describe, expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { sameCriteria } from "./basis";
import {
  emptyReviews,
  prepareReviewChange,
  assessmentInputSchema,
  type ReviewChange,
  type ReviewState,
} from "./index";

const contactId = "60000000-0000-4000-8000-000000000001";
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
const request: ReviewChange = { action: "request", id: "request", contactId, replacesId: null };
const record: ReviewChange = {
  action: "record",
  id: "assessment",
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

describe("recording reviews", () => {
  it("does not let a recording manager rewrite an authenticated reviewer submission", () => {
    const source = apply(emptyReviews(), record);
    source.assessments[0]!.authorUserId = "sam";
    const before = structuredClone(source);
    expect(
      prepareReviewChange(
        source,
        {
          action: "edit",
          id: record.id,
          content: { ...content, reasoning: "Manager replacement" },
          note: "",
        },
        context,
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
          { ...request, id: "replacement", replacesId: request.id },
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
        { action: "edit", id: "missing", content, note: "Correction" },
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

  it("receives an incomplete external judgment, then preserves it through a correction and follow-up", () => {
    let state = apply(emptyReviews(), {
      action: "request",
      id: "request",
      contactId,
      replacesId: null,
    });
    state = apply(state, {
      action: "record",
      id: "assessment",
      contactId,
      requestId: "request",
      previousId: null,
      content,
    });

    assert.isDefined(state.requests[0]);
    expect(state.requests[0].status).toBe("received");

    state = apply(state, {
      action: "edit",
      id: "assessment",
      note: "",
      content: { ...content, reasoning: "Corrected transcription." },
    });

    assert.isDefined(state.assessments[0]);
    assert.isDefined(state.assessments[0].versions[0]);
    assert.isDefined(state.assessments[0].versions[1]);
    expect(state.assessments[0].versions[0].content).toEqual(content);
    expect(state.assessments[0].versions[1].recorder?.userId).toBe("dana");

    state = apply(state, { action: "request", id: "follow-up", contactId, replacesId: null });
    state = apply(state, {
      action: "record",
      id: "later",
      contactId,
      requestId: "follow-up",
      previousId: "assessment",
      content: { ...content, applicationVersion: materialVersionSchema.parse(2) },
    });

    expect(state.assessments).toHaveLength(2);
    expect(state.assessments[1]).toMatchObject({
      previousId: "assessment",
      versions: [{ content: { applicationVersion: materialVersionSchema.parse(2) } }],
    });
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
    const request: ReviewChange = { action: "request", id: "request", contactId, replacesId: null };

    expect(
      prepareReviewChange(emptyReviews(), request, {
        ...context,
        contact: { ...context.contact, ...contact },
      }),
    ).toEqual({ ok: false, error: "contact_unavailable" });
  });

  it("rejects a second outstanding request for the same reviewer", () => {
    const request: ReviewChange = { action: "request", id: "request", contactId, replacesId: null };
    const state = apply(emptyReviews(), request);

    expect(prepareReviewChange(state, { ...request, id: "duplicate" }, context)).toMatchObject({
      ok: false,
      error: "already_requested",
    });
  });

  it.each(["1.001", "-1"])("rejects an unsupported assessment amount: %s", (amount) => {
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
        id: "assessment",
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
            id: "assessment",
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
      id: "request",
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
          id: "assessment",
          contactId: other.id,
          requestId: "request",
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
      id: "original",
      contactId,
      requestId: null,
      previousId: null,
      content,
    });
    const source = apply(original, {
      action: "record",
      id: "latest",
      contactId,
      requestId: null,
      previousId: "original",
      content: { ...content, reasoning: "Venue is now confirmed." },
    });
    const before = structuredClone(source);

    expect(
      prepareReviewChange(
        source,
        {
          action: "record",
          id: "follow-up",
          contactId,
          requestId: null,
          previousId: "original",
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
      id: "assessment",
      contactId,
      requestId: null,
      previousId: null,
      content,
    });
    const source = apply(recorded, {
      action: "request",
      id: "request",
      contactId,
      replacesId: null,
    });
    const before = structuredClone(source);
    const replacement = { id: "replacement-reviewer", name: "Jules", archived: false };
    const result = prepareReviewChange(
      source,
      {
        action: "request",
        id: "replacement",
        contactId: replacement.id,
        replacesId: "request",
      },
      { ...context, contact: replacement },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.state.requests).toEqual([
      { ...source.requests[0], status: "cancelled", closedBy: context.recorder },
      { ...source.requests[0], id: "replacement", contactId: replacement.id, reviewer: "Jules" },
    ]);
    expect(result.state.assessments).toEqual(recorded.assessments);
    expect(result.state.revision).toBe(source.revision + 1);
    expect(source).toEqual(before);
  });
});

it("compares criterion meaning including descriptions", () => {
  expect(
    sameCriteria(
      [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }],
      [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit", description: "" }],
    ),
  ).toBe(true);
  expect(
    sameCriteria(
      [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit", description: "Local benefit" }],
      [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit", description: "Local benefit" }],
    ),
  ).toBe(true);
  expect(
    sameCriteria(
      [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit", description: "Local benefit" }],
      [{ id: "fd95f96c-1270-51c5-a64f-5649f25186d9", title: "Fit" }],
    ),
  ).toBe(false);
});
it.each(["0", "1"])("allows only zero allocation on a deferred assessment: %s", (amount) => {
  expect(assessmentInputSchema.safeParse({ ...content, position: "Defer", amount }).success).toBe(
    amount === "0",
  );
});

it("retains identified notes from earlier criteria and rejects IDs outside the round", () => {
  const criterionId = "20000000-0000-4000-8000-000000000001";
  const note = { criterionId, criterion: "Original wording", text: "Received judgment" };
  const change = { ...record, content: { ...content, observations: [note] } } as ReviewChange;
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
  expect(prepareReviewChange(emptyReviews(), change, known)).toMatchObject({
    ok: true,
    state: { assessments: [{ versions: [{ content: { observations: [note] } }] }] },
  });
  expect(prepareReviewChange(emptyReviews(), change, context)).toEqual({
    ok: false,
    error: "criteria_unavailable",
  });
  expect(
    prepareReviewChange(
      emptyReviews(),
      {
        ...record,
        content: {
          ...content,
          observations: [{ criterionId: null, criterion: "Unidentified", text: "Keep" }],
        },
      },
      context,
    ).ok,
  ).toBe(true);
  expect(assessmentInputSchema.parse({ ...content, observations: [note] }).observations).toEqual([
    note,
  ]);
});
