import { randomUUID } from "node:crypto";

import { expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { applicationTest as it } from "@merit/applications/testing";
import type { Database } from "@merit/db";
import { actor } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { contact } from "./assessment-test";

it("serializes competing review requests and rejects the stale revision", async ({
  db,
  locks,
  applications,
}) => {
  const address = await applications.createApplication("Community meals");
  const reviewer = await contact(db);

  const request = (connection: Database) =>
    saveApplicationReview(connection, actor, {
      ...address,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: { action: "request", id: randomUUID(), contactId: reviewer.id, replacesId: null },
    });

  expect(await locks.race(request, request)).toEqual({ status: "conflict" });
});
