import { assert, describe, expect, it } from "vite-plus/test";

import type { RoundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";

import { en } from "../../app/messages.en";
import { createLandingPreview } from "./landing-preview";

describe("landing preview", () => {
  it("shows the example's recommendations and the earlier review beside current evidence", () => {
    const round = getExampleRound();
    const preview = createLandingPreview(round);

    expect(preview.round.applications).toHaveLength(3);
    expect(preview.round.totals).toEqual({
      requested: round.totals.requested,
      proposed: round.totals.proposed,
      remaining: round.totals.remaining,
    });
    expect(preview.round.applications.find((item) => item.id === "A3")).toMatchObject({
      title: "Workshop Saturdays",
      reviews: { current: 0, outdated: 1, outstanding: 1, unknown: 0 },
      recommendation: { position: "Defer" },
    });
    expect(preview.comparison.application).toMatchObject({
      title: "Workshop Saturdays",
      version: 2,
    });
    expect(preview.comparison.assessment).toMatchObject({
      reviewer: "Sam Morgan",
      applicationVersion: 1,
    });
  });

  it("keeps both highlighted phrases in the evidence they explain", () => {
    const { comparison } = createLandingPreview(getExampleRound());

    expect(en.workflow.applicationHighlight.trim()).not.toBe("");
    expect(en.workflow.reviewHighlight.trim()).not.toBe("");
    expect(comparison.application.passage).toContain(en.workflow.applicationHighlight);
    expect(comparison.assessment.reasoning).toContain(en.workflow.reviewHighlight);
  });

  it("selects current evidence and an outdated review independently of list order", () => {
    const round = getExampleRound();
    const workshop = round.applications.find((item) => item.id === "A3");
    assert.isDefined(workshop);
    const earlierAssessment = workshop.assessments.find((item) => item.submission);
    assert.isDefined(earlierAssessment);
    assert.isNotNull(earlierAssessment.submission);
    workshop.evidence.unshift({ version: 1, passage: "An older application passage" });
    workshop.assessments.unshift({
      ...earlierAssessment,
      id: "current-review",
      status: "current",
      submission: {
        ...earlierAssessment.submission,
        applicationVersion: workshop.version,
        reasoning: "Current review",
      },
    });

    const { comparison } = createLandingPreview(round);

    expect(comparison.application.passage).toContain(en.workflow.applicationHighlight);
    expect(comparison.assessment.reasoning).toContain(en.workflow.reviewHighlight);
    expect(comparison.assessment.applicationVersion).toBe(1);
  });

  it("requires a budget and a remaining amount", () => {
    const round = getExampleRound();

    expect(() => createLandingPreview({ ...round, budget: null })).toThrow(
      "requires a round budget",
    );
    expect(() =>
      createLandingPreview({ ...round, totals: { ...round.totals, remaining: null } }),
    ).toThrow("requires a round budget");
  });

  it("requires a recommendation for every displayed application", () => {
    const round = getExampleRound();
    const application = round.applications[0];
    assert.isDefined(application);
    application.managerRecommendation = null;

    expect(() => createLandingPreview(round)).toThrow(
      `requires a recommendation for ${application.id}`,
    );
  });

  it("requires the featured application", () => {
    const round = getExampleRound();
    round.applications = round.applications.filter((item) => item.id !== "A3");

    expect(() => createLandingPreview(round)).toThrow("requires Workshop Saturdays (A3)");
  });

  it("requires evidence for the current application version", () => {
    const round = getExampleRound();
    const workshop = round.applications.find((item) => item.id === "A3");
    assert.isDefined(workshop);
    workshop.evidence = [{ version: 1, passage: "Only old evidence remains" }];

    expect(() => createLandingPreview(round)).toThrow(
      "requires evidence from the current application version",
    );
  });

  it.each(["missing", "unknown", "current"] as const)("rejects a %s review basis", (basis) => {
    const round: RoundView = getExampleRound();
    const workshop = round.applications.find((item) => item.id === "A3");
    assert.isDefined(workshop);
    const assessment = workshop.assessments.find((item) => item.submission);
    assert.isDefined(assessment);
    assert.isNotNull(assessment.submission);
    if (basis === "missing") {
      workshop.assessments = [];
    } else {
      assessment.submission.applicationVersion = basis === "unknown" ? null : workshop.version;
    }

    expect(() => createLandingPreview(round)).toThrow(
      "requires a review of an earlier application version",
    );
  });
});
