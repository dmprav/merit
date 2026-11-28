import { assert, describe, expect } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import {
  getFundingApplicationContent,
  getFundingApplicationPage,
  getFundingRoundPage,
  listFundingApplicationHistory,
  listFundingRounds,
} from "@merit/grantmaking/server";
import { encodeMoney, fromMinorUnits } from "@merit/money";
import { actor, workspaceSlug } from "@merit/organizations/testing/workspace";
import { encodeRecommendation } from "@merit/recommendations/api";
import { saveFundingRecommendation } from "@merit/recommendations/server";
import {
  withRestrictedRecommendationRole,
  recommendationRequest,
  recommendationTest as it,
  withRejectedRecommendationWrite,
} from "@merit/recommendations/testing";
import { isCurrentAssessment } from "@merit/reviews/server/integrations";

import { applicationWork } from "./application-work";

describe("persisted recommendations", () => {
  it("reads the exact recommendation change and its predecessor for the selected case", async ({
    db,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    expect(await saveFundingRecommendation(db, actor, request, isCurrentAssessment)).toMatchObject({
      status: "ok",
    });

    const readChange = (revision: number) =>
      getFundingApplicationContent(db, actor, {
        workspaceSlug,
        applicationId: request.publicId,
        section: "recommendation_change",
        revision,
      });

    const first = await readChange(1);
    const second = await readChange(2);
    assert(first.status === "ok" && second.status === "ok");
    const original = { reasoning: "Original allocation." };
    expect(JSON.parse(first.content)).toMatchObject({
      revision: 1,
      before: null,
      after: original,
    });
    expect(JSON.parse(second.content)).toMatchObject({
      revision: 2,
      actorUserId: actor.userId,
      before: original,
      after: { reasoning: request.recommendation.reasoning },
    });
    expect(await readChange(3)).toMatchObject({ status: "not_found" });
  });

  it("lists rounds with the restricted role used to save recommendations", async ({ db }) => {
    await withRestrictedRecommendationRole(db, async (tx) => {
      expect(await listFundingRounds(tx, actor, "alder")).toMatchObject({
        status: "ok",
        rounds: [expect.objectContaining({ organizationId: "alder" })],
      });
    });
  });

  it("rejects a recommendation based on superseded application material without changing the page or history", async ({
    db,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const saved = await saveFundingRecommendation(db, actor, request, isCurrentAssessment);
    assert(saved.status === "ok");

    const current = (await getFundingApplicationPage(db, actor, scenario.selected))!;
    const started = await editFundingApplication(
      db,
      actor,
      {
        ...scenario.selected,
        expectedRevision: current.intake.revision,
        change: { action: "start_revision", kind: "revision" },
      },
      applicationWork,
    );
    assert(started.status === "ok");
    const drafted = await editFundingApplication(
      db,
      actor,
      {
        ...scenario.selected,
        expectedRevision: started.revision,
        change: {
          action: "save_revision",
          draft: {
            kind: "revision",
            reason: "Updated request",
            content: { requested: "81.00" },
          },
        },
      },
      applicationWork,
    );
    assert(drafted.status === "ok");
    expect(
      await editFundingApplication(
        db,
        actor,
        {
          ...scenario.selected,
          expectedRevision: drafted.revision,
          change: { action: "publish_revision" },
        },
        applicationWork,
      ),
    ).toMatchObject({ status: "ok" });

    const address = { workspaceSlug: request.workspaceSlug, publicId: request.publicId };
    const historyInput = {
      workspaceSlug: request.workspaceSlug,
      applicationId: request.publicId,
      history: "recommendation" as const,
    };
    const before = await getFundingApplicationPage(db, actor, address);
    const history = await listFundingApplicationHistory(db, actor, historyInput);
    expect(before).toMatchObject({
      application: { managerRecommendation: saved.recommendation },
      recommendationVersion: 2,
    });
    expect(history).toMatchObject({ status: "ok", entries: [{ revision: 1 }, { revision: 2 }] });

    const rejected = await saveFundingRecommendation(
      db,
      actor,
      {
        ...request,
        expectedRevision: saved.recommendationVersion,
        recommendation: encodeRecommendation({
          position: "Fund with a condition",
          allocation: fromMinorUnits(5000n),
          reasoning: "A different proposal based on stale information.",
        }),
      },
      isCurrentAssessment,
    );

    expect(rejected).toEqual({ status: "conflict" });
    expect(await getFundingApplicationPage(db, actor, address)).toEqual(before);
    expect(await listFundingApplicationHistory(db, actor, historyInput)).toEqual(history);
  });

  it("returns the current budget with committed totals for subsequent editor previews", async ({
    db,
    database,
    scenario,
  }) => {
    const request = recommendationRequest(scenario.selected.publicId);
    const budget = encodeMoney(fromMinorUnits(1000n));
    await database.client.query(
      "UPDATE funding_rounds SET budget_minor_units = $1 WHERE organization_id = 'alder'",
      [budget.minorUnits],
    );
    const result = await saveFundingRecommendation(db, actor, request, isCurrentAssessment);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error("Expected save to succeed");
    }
    expect(encodeMoney(result.budget!)).toEqual(budget);

    const persisted = await getFundingRoundPage(db, actor, scenario.round);
    assert.isNotNull(persisted);

    expect(encodeMoney(result.totals.proposed)).toEqual(
      encodeMoney(persisted.round.totals.proposed),
    );
    expect(encodeMoney(result.totals.remaining!).minorUnits).toBe("-6000");
    expect(encodeMoney(result.totals.remaining!)).toEqual(
      encodeMoney(persisted.round.totals.remaining!),
    );
  });

  it.for(["recommendation_versions", "audit_events"] as const)(
    "preserves the round page if writing %s fails",
    async (table, { db, database, scenario }) => {
      const request = recommendationRequest(scenario.selected.publicId);
      const original = await getFundingRoundPage(db, actor, scenario.round);
      assert.isNotNull(original);
      await withRejectedRecommendationWrite(database.client, table, () =>
        saveFundingRecommendation(db, actor, request, isCurrentAssessment),
      );
      expect(await getFundingRoundPage(db, actor, scenario.round)).toEqual(original);
    },
  );
});
