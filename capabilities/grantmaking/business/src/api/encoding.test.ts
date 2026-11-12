import { assert, describe, expect, it } from "vite-plus/test";

import { decodeApplicationMaterial, encodeApplicationMaterial } from "@merit/applications/api";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { decodeRecommendation, encodeRecommendation } from "@merit/recommendations/api";
import { decodeRound, encodeRound } from "@merit/rounds/api";

import { makeApplication, makeAssessment, makeRound } from "../../tests/fixtures";
import {
  decodeApplication,
  decodeRoundOverview,
  encodeApplication,
  encodeRoundOverview,
} from "./encoding";

describe("round JSON", () => {
  it("includes round preparation fields without application content or judgments", () => {
    const round = makeRound({
      applications: [makeApplication({ summary: "Internal assessment" })],
    });
    const data = encodeRound(round);

    expect(data).not.toHaveProperty("applications");
    expect(decodeRound(data)).toMatchObject({ title: round.title, budget: null });
    expect(decodeRound(data)).not.toHaveProperty("applications");
  });

  it("rejects criteria supplied as strings", () => {
    const data = { ...encodeRoundOverview(makeRound()), criteria: ["Purpose"] };

    expect(() => decodeRoundOverview(data)).toThrowError(/criteria/);
  });

  it("preserves criterion titles and optional descriptions through JSON", () => {
    const criteria = [
      {
        id: "7bb21220-ecc6-5a1b-9eec-1a47e5e66bc4",
        title: "Local benefit",
        description: "Explain who benefits.",
      },
      { id: "c21dce51-35aa-5293-bd64-f2b7a8234f11", title: "Additional context" },
    ];
    const round = makeRound({ criteria, criteriaHistory: [{ version: 1, criteria }] });

    const data: unknown = JSON.parse(JSON.stringify(encodeRoundOverview(round)));
    const restored = decodeRoundOverview(data);

    expect(restored.criteria).toEqual(criteria);
    expect(restored.criteriaHistory).toEqual([{ version: 1, criteria }]);
  });

  it.each(["criteriaVersion", "criteriaHistory"])("rejects a round missing %s", (field) => {
    const data: Record<string, unknown> = { ...encodeRoundOverview(makeRound()) };
    delete data[field];

    expect(() => decodeRoundOverview(data)).toThrowError(new RegExp(field));
  });

  it("preserves an unset budget and meeting date through JSON", () => {
    const round = makeRound({ budget: null, meetingDate: null });
    const restored = decodeRoundOverview(JSON.parse(JSON.stringify(encodeRoundOverview(round))));

    expect(restored.budget).toBeNull();
    expect(restored.meetingDate).toBeNull();
    expect(encodeRoundOverview(restored)).toEqual(encodeRoundOverview(round));
  });

  it("excludes calculated totals and assessment displays from the encoded records", () => {
    const assessment = makeAssessment();
    const application = makeApplication({
      reviews: { revision: 1, requests: [], assessments: [assessment] },
    });
    const round = {
      ...makeRound(),
      totals: { proposed: fromMinorUnits(0n) },
      applications: [{ ...application, assessments: [{ id: assessment.id, status: "current" }] }],
    };

    const data = encodeRoundOverview(round);

    expect(data).not.toHaveProperty("totals");
    expect(data.applications).toHaveLength(1);
    expect(data.applications[0]).not.toHaveProperty("assessments");
    expect(data.applications[0]?.reviews).toEqual(application.reviews);
  });
});

describe("application JSON", () => {
  it.each(["reviews", "intakeStatus", "contactId"])(
    "rejects an application missing %s",
    (field) => {
      const application: Record<string, unknown> = { ...encodeApplication(makeApplication()) };
      delete application[field];
      const round = { ...encodeRoundOverview(makeRound()), applications: [application] };

      expect(() => decodeRoundOverview(round)).toThrowError(new RegExp(field));
    },
  );

  it("preserves an unknown requested amount through JSON", () => {
    const application = makeApplication({ requested: null });
    const restored = decodeApplication(JSON.parse(JSON.stringify(encodeApplication(application))));

    expect(restored.requested).toBeNull();
  });

  it("rejects a reviewer position containing free text", () => {
    const assessment = makeAssessment();
    const version = assessment.versions[0];
    assert.isDefined(version);
    const application = {
      ...encodeApplication(makeApplication()),
      reviews: {
        revision: 1,
        requests: [],
        assessments: [
          {
            ...assessment,
            versions: [{ ...version, content: { ...version.content, position: "Fund €24,000" } }],
          },
        ],
      },
    };

    expect(() =>
      decodeRoundOverview({ ...encodeRoundOverview(makeRound()), applications: [application] }),
    ).toThrowError(/position/);
  });
});

describe("application material JSON", () => {
  it.each([null, fromMinorUnits(12500n)])(
    "preserves requested amount %s and submitted answers without staff judgments",
    (requested) => {
      const application = makeApplication({
        requested,
        summary: "Staff-only interpretation",
        attention: ["Discuss with the committee"],
        submission: {
          version: 1,
          answers: [
            {
              questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
              question: "Purpose",
              response: "Community meals",
            },
          ],
        },
      });

      const material = decodeApplicationMaterial(encodeApplicationMaterial(application));

      expect(material.requested).toEqual(requested);
      expect(material.submission).toEqual(application.submission);
      expect(material).not.toHaveProperty("summary");
      expect(material).not.toHaveProperty("attention");
      expect(material).not.toHaveProperty("reviews");
      expect(material).not.toHaveProperty("managerRecommendation");
      expect(material).not.toHaveProperty("contactId");
    },
  );

  it.each([1, 2])(
    "keeps linked contact details on the application but out of material version %s",
    (version) => {
      const submission = {
        version,
        organization: "Applicant organization",
        contact: "Staff-selected contact",
        contactEmail: "contact@example.test",
        answers: [
          {
            questionId: "9e8cdd06-b965-551e-938f-43d2df580864",
            question: "Purpose",
            response: "Community meals",
          },
        ],
      };
      const application = makeApplication({ version, submission });

      const record = decodeApplication(encodeApplication(application));
      const material = decodeApplicationMaterial(encodeApplicationMaterial(record));

      expect(record.submission).toMatchObject({
        contact: submission.contact,
        contactEmail: submission.contactEmail,
      });
      expect(material.submission).toEqual({
        version,
        organization: submission.organization,
        answers: submission.answers,
      });
      expect(application.submission).toEqual(submission);
    },
  );
});

describe("recommendation JSON", () => {
  it.each([
    { amount: "0", reason: "zero funding" },
    { amount: "1.005", reason: "fractional minor units" },
  ])("rejects $reason", ({ amount }) => {
    expect(() =>
      decodeRecommendation({
        position: "Fund",
        allocation: { minorUnits: amount, currency: "EUR" },
        reasoning: "Proceed.",
      }),
    ).toThrow();
  });

  it("preserves allocations larger than JavaScript's safe integer limit", () => {
    const decoded = decodeRecommendation({
      position: "Fund",
      allocation: { minorUnits: "9007199254740993", currency: "EUR" },
      reasoning: "Proceed.",
    });

    expect(encodeMoney(decoded.allocation).minorUnits).toBe("9007199254740993");
  });
});

it("omits unpublished internal fields from public records", () => {
  const application = { ...makeApplication(), internalNote: "Private implementation detail" };
  const round = { ...makeRound(), internalNote: "Private implementation detail" };
  const recommendation = {
    position: "Fund" as const,
    allocation: fromMinorUnits(100n),
    reasoning: "Proceed",
    internalNote: "Private implementation detail",
  };

  expect(encodeApplication(application)).not.toHaveProperty("internalNote");
  expect(encodeRound(round)).not.toHaveProperty("internalNote");
  expect(encodeRecommendation(recommendation)).not.toHaveProperty("internalNote");
});
