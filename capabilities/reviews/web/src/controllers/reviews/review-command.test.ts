import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import {
  assessmentInputSchema,
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
  amount: "100.00",
  reasoning: values.reasoning,
  observations: values.observations,
};
const request: ReviewState["requests"][number] = {
  id: "pending-request",
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
  id: "first-assessment",
  contactId: "sam",
  reviewer: "Sam",
  requestId: null,
  previousId: null,
  versions: [{ content, criteria: [], recorder: null, note: "" }],
};
const state: ReviewState = {
  revision: reviewRevisionSchema.parse(9),
  requests: [
    { ...request, id: "cancelled-request", status: "cancelled" },
    { ...request, id: "received-request", status: "received" },
    { ...request, id: "other-request", contactId: "jules" },
    request,
  ],
  assessments: [
    assessment,
    { ...assessment, id: "latest-assessment", previousId: assessment.id },
    { ...assessment, id: "other-assessment", contactId: "jules" },
  ],
};
const draft: ReviewDraft = {
  mode: "record",
  id: "command-id",
  replacesId: "replaced-request",
  revision: reviewRevisionSchema.parse(4),
  applicationVersion: materialVersionSchema.parse(3),
  criteriaVersion: criteriaVersionSchema.parse(2),
  values,
};

it.each([
  {
    mode: "request" as const,
    change: {
      action: "request",
      id: "command-id",
      contactId: "sam",
      replacesId: "replaced-request",
    },
  },
  {
    mode: "edit" as const,
    change: { action: "edit", id: "command-id", content, note: values.note },
  },
  {
    mode: "record" as const,
    change: {
      action: "record",
      id: "command-id",
      contactId: "sam",
      requestId: "pending-request",
      previousId: "latest-assessment",
      content,
    },
  },
])("builds a $mode command using the draft's original baseline", ({ mode, change }) => {
  expect(reviewCommand({ ...draft, mode }, values, state)).toEqual({
    change,
    baseline: { revision: 4, applicationVersion: 3, criteriaVersion: 2 },
  });
});

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
    id: "command-id",
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
    const result = assessmentInputSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual([
        "applicationVersion",
        "criteriaVersion",
      ]);
    }
  },
);
