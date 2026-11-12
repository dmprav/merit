import { assert, expect, it } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makeRound, makeReviewedApplication } from "../../tests/fixtures";
import { decodeRoundOverview, encodeRoundOverview } from "./encoding";

const makeDatedRound = () => {
  const application = makeReviewedApplication();
  const assessment = application.reviews.assessments[0];
  assert.isDefined(assessment);
  const version = assessment.versions[0];
  assert.isDefined(version);
  application.submission = { version: 1, answers: [], submittedOn: "2024-02-28" };
  version.content.date = "2024-02-29";
  application.managerRecommendation = {
    position: "Fund",
    allocation: fromMinorUnits(100n),
    reasoning: "Proceed.",
    recorded: { date: "2024-03-02", applicationVersion: 1 },
  };
  return makeRound({
    applications: [application],
    meetingDate: "2024-02-29",
    snapshotDate: "2024-03-01",
  });
};

it("preserves calendar dates through the public round JSON", () => {
  const round = makeDatedRound();
  const restored = decodeRoundOverview(JSON.parse(JSON.stringify(encodeRoundOverview(round))));
  expect(restored).toMatchObject({
    meetingDate: "2024-02-29",
    snapshotDate: "2024-03-01",
    applications: [
      {
        submission: { submittedOn: "2024-02-28" },
        managerRecommendation: { recorded: { date: "2024-03-02", applicationVersion: 1 } },
        reviews: {
          assessments: [
            { versions: [{ content: { date: "2024-02-29" } }] },
            { versions: [{ content: { date: null } }] },
          ],
        },
      },
    ],
  });
});

it.each(["meetingDate", "snapshotDate", "submittedOn", "assessmentDate", "recommendationDate"])(
  "rejects a timestamp in the public round's %s calendar-date field",
  (field) => {
    const data = encodeRoundOverview(makeDatedRound());
    const application = data.applications[0];

    assert.isDefined(application);

    const assessment = application.reviews.assessments[0];

    assert.isDefined(assessment);

    const version = assessment.versions[0];

    assert.isDefined(version);
    assert.isDefined(application.submission);
    assert.isNotNull(application.managerRecommendation);
    assert.isDefined(application.managerRecommendation.recorded);

    const timestamp = "2027-01-21T00:00:00Z";
    if (field === "meetingDate") {
      data.meetingDate = timestamp;
    }
    if (field === "snapshotDate") {
      data.snapshotDate = timestamp;
    }
    if (field === "submittedOn") {
      application.submission.submittedOn = timestamp;
    }
    if (field === "assessmentDate") {
      version.content.date = timestamp;
    }
    if (field === "recommendationDate") {
      application.managerRecommendation.recorded.date = timestamp;
    }

    expect(() => decodeRoundOverview(data)).toThrow();
  },
);
