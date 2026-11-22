import { randomUUID } from "node:crypto";

import { assert } from "vite-plus/test";
import { z } from "zod";

import { getFundingApplicationPage } from "@merit/grantmaking/server";
import { actor } from "@merit/organizations/testing/workspace";

import type { ScenarioContext } from "../scenario";
import { checked } from "./client";

export const workspace = { workspaceSlug: "alder" };

export const content = (requested: string, response = "Weekly community activities.") => ({
  title: "Lanterns",
  applicant: "Community group",
  requested,
  answers: [{ questionId: "0e03fcf9-a422-5c35-9ac4-27be275d2f3e", question: "Purpose", response }],
});

export const seedRound = async (ctx: ScenarioContext, title: string) => {
  const result = await checked(ctx.seed, "create_funding_round", {
    ...workspace,
    requestId: randomUUID(),
    title,
  });
  return z.string().parse(result.roundId);
};

export const seedContact = async (
  ctx: ScenarioContext,
  name = "Jo Bell",
  email = "jo@example.test",
) => {
  const contactId = randomUUID();
  await checked(ctx.seed, "create_contact", {
    ...workspace,
    contactId,
    details: { name, email, affiliation: "Review Panel" },
  });
  return contactId;
};

export const application = (ctx: ScenarioContext, publicId: string) => {
  const address = { ...workspace, applicationId: publicId };

  const read = async () => {
    const page = await getFundingApplicationPage(ctx.db, actor, { ...workspace, publicId });
    assert(page, "Expected application in Alder");
    return page;
  };

  const write = async (name: string, fields: Record<string, unknown> = {}) =>
    checked(ctx.seed, name, {
      ...address,
      expectedIntakeRevision: (await read()).intake.revision,
      ...fields,
    });

  const review = async (
    name: string,
    fields: Record<string, unknown>,
    basis?: Awaited<ReturnType<typeof read>>,
  ) => {
    const page = basis ?? (await read());
    return checked(ctx.seed, name, {
      ...address,
      expectedReviewRevision: page.application.reviews.revision,
      expectedApplicationVersion: page.application.version,
      expectedCriteriaVersion: page.round.criteriaVersion,
      ...fields,
    });
  };

  const request = async (contactId: string) =>
    review("request_review", { id: randomUUID(), replacesId: null, contactId });

  const assessment = async (
    contactId: string,
    amount: string,
    reasoning: string,
    previousId: string | null = null,
  ) => {
    const page = await read();
    const id = randomUUID();
    await review(
      "record_assessment",
      {
        id,
        contactId,
        requestId: null,
        previousId,
        content: {
          applicationVersion: page.application.version,
          criteriaVersion: page.round.criteriaVersion,
          date: "2025-09-01",
          position: "Fund",
          amount: { currency: "EUR", minorUnits: amount },
          reasoning,
          observations: [],
        },
      },
      page,
    );
    return id;
  };

  return { address, read, write, request, assessment };
};

export type EvalApplication = ReturnType<typeof application>;

export const lanterns = async (ctx: ScenarioContext, requested = "2000.00") =>
  application(ctx, (await ctx.createApplication("Lanterns", requested)).publicId);
