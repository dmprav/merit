import { expect, it } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import {
  aiReviewAvailability,
  aiReviewEntry,
  aiReviewInput,
  aiReviewOutputSchema,
  verifyAiReviewOutput,
  type AiReviewRecord,
} from "./ai-review";

const first = "3f540e1d-ce19-4e97-aa88-9db6bbc4a476";
const second = "b0a19c10-5f4d-4b52-8bd5-2f1ae5a94c33";
const questionId = "282b068c-b066-4bbb-926c-4da54b0b1494";
const criteria = [
  { id: first, title: "Community connection", description: "Bringing people together." },
  { id: second, title: "Budget and value" },
];

const material = {
  title: "Workshop Saturdays",
  version: 2,
  requested: { minorUnits: "2200000", currency: "EUR" },
  submission: {
    version: 2,
    organization: "Saturday Repair Collective",
    projectPeriod: "April–September 2027",
    answers: [
      {
        questionId,
        question: "Revised venue and funding request",
        response:
          "The free venue is no longer available.\nThe replacement venue has not yet been booked.",
      },
    ],
  },
  evidence: [{ version: 2, passage: "Hidden evidence passage" }],
};

const input = aiReviewInput(material, criteria);

const section = (criterionId: string | null, claim = "venue") => ({
  criterionId,
  claims: [
    {
      text: `About the ${claim}`,
      citations: [{ source: questionId, quote: "The replacement venue has not yet been booked" }],
    },
  ],
  gaps: [],
  strengths: [],
  weaknesses: [],
  concerns: [],
});

const output = {
  criteria: [section(first), section(second)],
  questions: ["Which venue will you book?"],
  reasoning: "The venue is not confirmed.",
  position: "Defer",
  amount: { minorUnits: "0", currency: "EUR" },
};

it("sends only the material version and the criteria, never anything else about the application", () => {
  expect(input).toEqual({
    application: {
      title: "Workshop Saturdays",
      applicant: "Saturday Repair Collective",
      requested: "22000.00 EUR",
      projectPeriod: "April–September 2027",
      submittedOn: null,
      answers: [
        {
          questionId,
          question: "Revised venue and funding request",
          response: material.submission.answers[0]!.response,
        },
      ],
    },
    criteria: [
      { id: first, title: "Community connection", description: "Bringing people together." },
      { id: second, title: "Budget and value", description: "" },
    ],
  });
  expect(JSON.stringify(input)).not.toContain("Hidden evidence passage");
});

it("accepts verbatim quotes after collapsing whitespace and ignoring case", () => {
  const reply = {
    ...output,
    criteria: [
      {
        ...section(first),
        claims: [
          {
            text: "The venue is open",
            citations: [
              { source: questionId, quote: "NO LONGER   available.\n the replacement venue" },
              { source: "title", quote: "workshop saturdays" },
              { source: "applicant", quote: "Repair Collective" },
              { source: "requested", quote: "22000.00 EUR" },
            ],
          },
        ],
      },
      section(second),
    ],
  };
  expect(verifyAiReviewOutput(input, reply)).toMatchObject({ ok: true });
});

it.each([
  ["a paraphrase", { source: questionId, quote: "The venue is not booked" }],
  ["the wrong field", { source: "title", quote: "The replacement venue" }],
  ["an unknown question", { source: second, quote: "The replacement venue" }],
])("rejects the whole review for an unverifiable citation: %s", (_name, citation) => {
  const reply = {
    ...output,
    criteria: [
      { ...section(first), claims: [{ text: "Claim", citations: [citation] }] },
      section(second),
    ],
  };
  expect(verifyAiReviewOutput(input, reply)).toEqual({ ok: false, error: "unverifiable_citation" });
});

it("cannot cite a requested amount the application does not state", () => {
  const unstated = aiReviewInput({ ...material, requested: null }, criteria);
  const reply = {
    ...output,
    criteria: [
      {
        ...section(first),
        claims: [{ text: "Claim", citations: [{ source: "requested", quote: "EUR" }] }],
      },
      section(second),
    ],
  };
  expect(verifyAiReviewOutput(unstated, reply)).toEqual({
    ok: false,
    error: "unverifiable_citation",
  });
  expect(verifyAiReviewOutput(input, { ...output, criteria: "none" })).toEqual({
    ok: false,
    error: "invalid_output",
  });
});

it("requires exactly one entry for each current criterion, in criteria order", () => {
  for (const mismatched of [
    [section(second), section(first)],
    [section(first)],
    [section(first), section(second), section(null)],
    [section(first), section(first)],
  ]) {
    expect(verifyAiReviewOutput(input, { ...output, criteria: mismatched })).toEqual({
      ok: false,
      error: "criteria_mismatch",
    });
  }
});

it("uses one whole-application entry when the round has no criteria", () => {
  const bare = aiReviewInput(material, []);
  expect(verifyAiReviewOutput(bare, { ...output, criteria: [section(null)] })).toMatchObject({
    ok: true,
  });
  expect(verifyAiReviewOutput(bare, { ...output, criteria: [section(first)] })).toEqual({
    ok: false,
    error: "criteria_mismatch",
  });
});

it("reviews an application with no submitted answers", () => {
  const empty = aiReviewInput({ ...material, submission: undefined, requested: null }, criteria);
  expect(empty.application).toMatchObject({ applicant: "", requested: null, answers: [] });
  const reply = {
    ...output,
    criteria: criteria.map(({ id }) => ({ ...section(id), claims: [], gaps: ["No answers."] })),
  };
  expect(verifyAiReviewOutput(empty, reply)).toMatchObject({ ok: true });
});

it.each([
  ["a blank reasoning", { reasoning: "  " }],
  ["an overlong reasoning", { reasoning: "x".repeat(20001) }],
  [
    "too many questions",
    { questions: Array.from({ length: 21 }, (_, index) => `Question ${index}`) },
  ],
  ["a blank question", { questions: [" "] }],
  ["a funding position with no amount", { position: "Fund" }],
  [
    "a decline with an amount",
    { position: "Decline", amount: { minorUnits: "100", currency: "EUR" } },
  ],
  ["a negative amount", { position: "Fund", amount: { minorUnits: "-100", currency: "EUR" } }],
  ["a numeric score", { score: 7 }],
  ["an unknown position", { position: "Maybe" }],
])("rejects %s", (_name, change) => {
  expect(aiReviewOutputSchema.safeParse({ ...output, ...change }).success).toBe(false);
});

it("bounds list items, claims, citations and quotes", () => {
  const long = "x".repeat(2001);

  const overlong = (change: object) =>
    aiReviewOutputSchema.safeParse({
      ...output,
      criteria: [{ ...section(first), ...change }, section(second)],
    }).success;

  expect(overlong({ gaps: [long] })).toBe(false);
  expect(overlong({ gaps: Array.from({ length: 21 }, () => "Gap") })).toBe(false);
  expect(overlong({ claims: [{ text: "Claim", citations: [] }] })).toBe(false);
  expect(
    overlong({
      claims: [{ text: "Claim", citations: [{ source: "title", quote: "q".repeat(501) }] }],
    }),
  ).toBe(false);
  expect(overlong({ gaps: Array.from({ length: 20 }, () => "Gap") })).toBe(true);
});

it("treats a funding position as a positive amount and deferral as zero", () => {
  const accepts = (position: string, minorUnits: string) =>
    aiReviewOutputSchema.safeParse({
      ...output,
      position,
      amount: { minorUnits, currency: "EUR" },
    }).success;

  expect([
    accepts("Fund", "1"),
    accepts("Fund with a condition", "500"),
    accepts("Defer", "0"),
    accepts("Decline", "0"),
    accepts("Fund", "0"),
    accepts("Defer", "5"),
  ]).toEqual([true, true, true, true, false, false]);
});

it("reports why a run is unavailable, with a demo taking precedence", () => {
  const facts = {
    workspaceKind: "standard",
    withdrawn: false,
    providerConfigured: true,
    consent: true,
  } as const;
  expect(aiReviewAvailability(facts)).toBe("available");
  expect(aiReviewAvailability({ ...facts, consent: false })).toBe("consent_required");
  expect(aiReviewAvailability({ ...facts, providerConfigured: false })).toBe(
    "provider_unconfigured",
  );
  expect(aiReviewAvailability({ ...facts, withdrawn: true })).toBe("withdrawn");
  expect(
    aiReviewAvailability({
      workspaceKind: "demo",
      withdrawn: true,
      providerConfigured: false,
      consent: false,
    }),
  ).toBe("demo");
});

it("ages an AI review with the same freshness policy as an assessment", () => {
  const record: AiReviewRecord = {
    id: "5a2cb9b7-4a6e-4f5a-a0f2-b0f3a1c0e100",
    applicationVersion: materialVersionSchema.parse(1),
    criteriaVersion: criteriaVersionSchema.parse(1),
    provider: "Example",
    model: "Prepared example",
    runBy: { userId: "dana", name: "Dana Reed" },
    provenance: { interface: "web" },
    recordedAt: "2027-01-18T10:00:00.000Z",
    position: "Defer",
    amount: { minorUnits: "0", currency: "EUR" },
    reasoning: "Reasoning",
    criteria: [{ ...section(first), title: "Community connection" }],
    questions: [],
    recordedCriteria: [{ id: first, title: "Community connection" }],
  };
  const current = {
    applicationVersion: materialVersionSchema.parse(1),
    criteriaVersion: criteriaVersionSchema.parse(1),
    criteria: [{ id: first, title: "Community connection" }],
  };
  expect(aiReviewEntry(record, current).freshness).toBe("current");
  expect(
    aiReviewEntry(record, { ...current, applicationVersion: materialVersionSchema.parse(2) })
      .freshness,
  ).toBe("outdated");
  expect(
    aiReviewEntry(record, { ...current, criteria: [{ id: first, title: "Renamed" }] }).freshness,
  ).toBe("outdated");
  expect(aiReviewEntry({ ...record, recordedCriteria: null }, current).freshness).toBe("unknown");
  expect(
    aiReviewEntry(record, {
      ...current,
      criteriaVersion: criteriaVersionSchema.parse(2),
    }).freshness,
  ).toBe("current");
});
