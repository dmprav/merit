import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import {
  assessmentEntrySchema,
  type AssessmentInput,
  type ReviewState,
} from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import type { ReviewDraft, ReviewFormValues } from "./drafts";
import { reviewCommand } from "./review-command";
import { contentFromValues } from "./values";

const values: ReviewFormValues = {
  contactId: "sam",
  applicationVersion: "2",
  criteriaVersion: "1",
  date: "2026-11-10",
  position: "Fund",
  amount: "100.00",
  reasoning: "The proposal addresses a local need.",
  observations: [{ criterionId: null, criterion: "Fit", text: "Within scope." }],
  note: "Corrected the recorded amount.",
};
const content: AssessmentInput = {
  applicationVersion: materialVersionSchema.parse(2),
  criteriaVersion: criteriaVersionSchema.parse(1),
  date: "2026-11-10",
  position: "Fund",
  amount: encodeMoney(fromMinorUnits(10000n)),
  reasoning: values.reasoning,
  observations: values.observations,
};
const request: ReviewState["requests"][number] = {
  id: crypto.randomUUID(),
  contactId: "sam",
  reviewer: "Sam",
  applicationVersion: materialVersionSchema.parse(2),
  criteriaVersion: criteriaVersionSchema.parse(1),
  criteria: [],
  status: "outstanding",
  recorder: null,
  closedBy: null,
};
const assessment: ReviewState["assessments"][number] = {
  id: crypto.randomUUID(),
  contactId: "sam",
  reviewer: "Sam",
  requestId: null,
  previousId: null,
  versions: [{ content, criteria: [], recorder: null, note: "" }],
};
const latestAssessmentId = crypto.randomUUID();
const state: ReviewState = {
  revision: reviewRevisionSchema.parse(9),
  requests: [
    { ...request, id: crypto.randomUUID(), status: "cancelled" },
    { ...request, id: crypto.randomUUID(), status: "received" },
    { ...request, id: crypto.randomUUID(), contactId: "jules" },
    request,
  ],
  assessments: [
    assessment,
    { ...assessment, id: latestAssessmentId, previousId: assessment.id },
    { ...assessment, id: crypto.randomUUID(), contactId: "jules" },
  ],
};
const draft: ReviewDraft = {
  mode: "record",
  id: crypto.randomUUID(),
  revision: reviewRevisionSchema.parse(4),
  applicationVersion: materialVersionSchema.parse(3),
  criteriaVersion: criteriaVersionSchema.parse(2),
  values,
};

it.each([
  {
    mode: "edit" as const,
    assessmentVersion: 1,
    change: {
      action: "edit",
      id: draft.id,
      expectedAssessmentVersion: 1,
      content,
      note: values.note,
    },
  },
  {
    mode: "record" as const,
    assessmentVersion: undefined,
    change: {
      action: "record",
      id: draft.id,
      contactId: "sam",
      requestId: request.id,
      previousId: latestAssessmentId,
      content,
    },
  },
])(
  "builds a $mode command using the draft's original baseline",
  ({ mode, assessmentVersion, change }) => {
    expect(reviewCommand({ ...draft, mode, assessmentVersion }, values, state)).toEqual({
      change,
      baseline: { revision: 4, applicationVersion: 3, criteriaVersion: 2 },
    });
  },
);

it("records an unsolicited assessment with unknown bases without inventing links or values", () => {
  const command = reviewCommand(
    draft,
    {
      ...values,
      applicationVersion: "unknown",
      criteriaVersion: "unknown",
      date: "",
      position: "unknown",
      amount: "",
    },
    { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
  );

  expect(command.change).toEqual({
    action: "record",
    id: draft.id,
    contactId: "sam",
    requestId: null,
    previousId: null,
    content: {
      ...content,
      applicationVersion: null,
      criteriaVersion: null,
      date: null,
      position: null,
      amount: null,
    },
  });
});

it.each(["0", "", "invalid", "1.5"])(
  "reports invalid form version %j without throwing during validation",
  (version) => {
    const input = contentFromValues({
      ...values,
      applicationVersion: version,
      criteriaVersion: version,
    });
    const result = assessmentEntrySchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "applicationVersion",
        "criteriaVersion",
      ]);
    }
  },
);
