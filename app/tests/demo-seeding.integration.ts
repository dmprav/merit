import { readFileSync } from "node:fs";

import { assert, expect } from "vite-plus/test";
import { z } from "zod";

import { editFundingApplication } from "@merit/applications/server";
import { recordAuditEvent } from "@merit/audit/server/record";
import { migrate } from "@merit/db/migrate";
import { encodeRoundOverview } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import {
  getFundingApplicationPage,
  getFundingRoundPage,
  listFundingRounds,
} from "@merit/grantmaking/server";
import { applicationWork } from "@merit/grantmaking/server/integrations";
import { seedExampleRounds } from "@merit/grantmaking/testing";
import { actor } from "@merit/organizations/testing/workspace";
import { loadFundingRoundPage } from "@merit/product/grantmaking";
import { loadWorkspace } from "@merit/product/workspace";
import { databaseTest } from "@merit/test-support/database";

import { localWorkspaceIdentity } from "../src/development/local-workspace.server";
import { createTransport } from "./fixtures/transport-test";

const it = databaseTest.extend("seeded", async ({ db }) => {
  await seedExampleRounds(db);
  const listed = await listFundingRounds(db, actor, "alder");
  assert(listed.status === "ok");
  const [round] = listed.rounds;

  assert.isDefined(round);

  return { workspaceSlug: round.workspaceSlug, publicId: round.publicId, kind: "round" as const };
});

it("keeps local access independent of Clerk linking and enforces current permissions", async ({
  db,
  database,
  seeded: pageInput,
}) => {
  const { services } = createTransport(db);
  const local = { ...services, currentIdentity: localWorkspaceIdentity };
  await seedExampleRounds(db, "user_linked");
  await seedExampleRounds(db);

  expect((await loadWorkspace(local)).status).toBe("ok");
  expect((await loadFundingRoundPage(pageInput, local)).status).toBe("ok");
  expect(await loadFundingRoundPage({ ...pageInput, workspaceSlug: "birch" }, local)).toEqual({
    status: "not_found",
  });
  expect(
    (
      await database.client.query<{ clerk_user_id: string | null }>(
        "SELECT clerk_user_id FROM app_users WHERE id = 'dana'",
      )
    ).rows[0]?.clerk_user_id,
  ).toBe("user_linked");

  await database.client.query(
    "UPDATE app_users SET active = false WHERE id = 'local-workspace-manager'",
  );

  expect(await loadFundingRoundPage(pageInput, local)).toEqual({ status: "not_found" });

  await database.client.query(
    "UPDATE app_users SET active = true WHERE id = 'local-workspace-manager'",
  );
  await database.client.query("DELETE FROM memberships WHERE user_id = 'local-workspace-manager'");

  expect(await loadFundingRoundPage(pageInput, local)).toEqual({ status: "not_found" });
  expect(await loadWorkspace(local)).toEqual({ status: "no_workspace" });
});

it("runs migrations and seed repeatedly without overwriting existing data", async ({
  db,
  database,
  seeded: pageInput,
}) => {
  await database.client.query(
    "UPDATE funding_rounds SET title = 'Edited title' WHERE organization_id = 'alder'",
  );
  await migrate(database.client);
  await seedExampleRounds(db);

  expect((await getFundingRoundPage(db, actor, pageInput))?.round.title).toBe("Edited title");
  expect(
    (await database.client.query("SELECT * FROM drizzle.__drizzle_migrations")).rows,
  ).toHaveLength(
    z
      .object({ entries: z.array(z.unknown()) })
      .parse(
        JSON.parse(
          readFileSync(
            new URL("../../foundation/db/database/migrations/meta/_journal.json", import.meta.url),
            "utf8",
          ),
        ),
      ).entries.length,
  );
});

it("creates independent applications with exact amounts and permanent public IDs", async ({
  db,
  database,
  seeded: pageInput,
}) => {
  const original = encodeRoundOverview(getExampleRound());
  const rounds = (
    await database.client.query<{ public_id: string; title: string; budget: string }>(
      "SELECT id AS public_id, title, budget FROM funding_rounds ORDER BY organization_id",
    )
  ).rows;
  const applications = (
    await database.client.query<{ public_id: string; round_id: string }>(
      "SELECT id AS public_id, round_id FROM application_cases ORDER BY organization_id, position",
    )
  ).rows;

  expect(new Set(rounds.map((round) => round.public_id)).size).toBe(2);
  expect(new Set(applications.map((application) => application.public_id)).size).toBe(6);

  for (const row of [...rounds, ...applications]) {
    expect(row.public_id).toMatch(/^[0-9a-hjkmnp-tv-z]{12}$/);
  }

  expect(
    applications.slice(0, 3).every((application) => application.round_id === rounds[0]!.public_id),
  ).toBe(true);
  original.id = rounds[0]!.public_id;
  for (const [index, application] of original.applications.entries()) {
    application.id = applications[index]!.public_id;
  }

  const seededContacts = (
    await database.client.query<{ id: string; name: string }>(
      "SELECT id, name FROM contacts WHERE organization_id = 'alder'",
    )
  ).rows;

  expect(seededContacts).toHaveLength(5);

  const contactIds = new Map(seededContacts.map((contact) => [contact.name, contact.id]));
  for (const application of original.applications) {
    const contactId = contactIds.get(application.submission!.contact!);

    assert.isDefined(contactId);

    application.contactId = contactId;

    for (const review of [...application.reviews.requests, ...application.reviews.assessments]) {
      const reviewerId = contactIds.get(review.reviewer);

      assert.isDefined(reviewerId);

      review.contactId = reviewerId;
    }
  }

  expect(
    encodeRoundOverview((await getFundingRoundPage(db, actor, pageInput))!.round),
  ).toMatchObject({
    ...original,
    managerUserId: "dana",
    managerNeedsReassignment: false,
    applications: original.applications.map((application) => ({
      ...application,
      managerRecommendation: application.managerRecommendation && {
        ...application.managerRecommendation,
        author: { name: original.manager },
      },
    })),
  });

  expect(rounds[0]).toMatchObject({ title: original.title, budget: original.budget!.minorUnits });
  const material = (
    await database.client.query<{ content: Record<string, unknown> }>(
      "SELECT content FROM material_versions ORDER BY case_id, version",
    )
  ).rows;
  expect(material).toHaveLength(8);
  for (const row of material) {
    expect(row.content).not.toHaveProperty("reviews");
    expect(row.content).not.toHaveProperty("managerRecommendation");
    expect(row.content).not.toHaveProperty("summary");
  }
  await expect(
    database.client.query("UPDATE material_versions SET content='{}'::jsonb"),
  ).rejects.toThrow();
});

it("resolves public identities under current permissions and preserves them across edits and reseeding", async ({
  db,
  database,
  seeded: pageInput,
}) => {
  const listed = await listFundingRounds(db, actor, "alder");
  assert(listed.status === "ok");
  const [summary] = listed.rounds;

  assert.isDefined(summary);

  const page = await getFundingRoundPage(db, actor, {
    workspaceSlug: summary.workspaceSlug,
    publicId: summary.publicId,
    kind: "round",
  });

  expect(page).not.toBeNull();

  const application = page!.round.applications[2];

  assert.isDefined(application);

  const request = {
    workspaceSlug: "alder",
    publicId: application.id,
  };

  expect((await getFundingApplicationPage(db, actor, request))?.application.id).toBe(
    application.id,
  );
  expect(
    await getFundingApplicationPage(db, actor, { ...request, workspaceSlug: "birch" }),
  ).toBeNull();
  expect(await getFundingApplicationPage(db, { userId: "birch-manager" }, request)).toBeNull();

  const current = (await getFundingApplicationPage(db, actor, request))!;
  const started = await editFundingApplication(
    db,
    actor,
    {
      ...request,
      expectedRevision: current.intake.revision,
      change: { action: "start_revision", kind: "correction" },
    },
    applicationWork,
    recordAuditEvent,
  );
  assert(started.status === "ok");
  const drafted = await editFundingApplication(
    db,
    actor,
    {
      ...request,
      expectedRevision: started.revision,
      change: {
        action: "save_revision",
        draft: {
          kind: "correction",
          reason: "Correct the title",
          content: { title: "Renamed application" },
        },
      },
    },
    applicationWork,
    recordAuditEvent,
  );
  assert(drafted.status === "ok");
  expect(
    await editFundingApplication(
      db,
      actor,
      {
        ...request,
        expectedRevision: drafted.revision,
        change: { action: "publish_revision" },
      },
      applicationWork,
      recordAuditEvent,
    ),
  ).toMatchObject({ status: "ok" });
  await database.client.query(
    "UPDATE organizations SET name = 'Renamed foundation' WHERE id = 'alder'",
  );
  await seedExampleRounds(db);
  const renamed = await getFundingApplicationPage(db, actor, request);

  expect(renamed!.application.title).toBe("Renamed application");
  expect(renamed!.workspaceSlug).toBe("alder");
  expect(renamed!.round.id).toBe(page!.round.id);
  expect(renamed!.application.id).toBe(application.id);

  expect(
    (
      (await getFundingRoundPage(db, actor, pageInput))!.round.applications[2] ??
      assert.fail(
        "Expected (await getFundingRoundPage(db, actor, pageInput))!.round.applications[2]",
      )
    ).title,
  ).toBe("Renamed application");

  await database.client.query("DELETE FROM memberships WHERE user_id = 'dana'");

  expect(await getFundingApplicationPage(db, actor, request)).toBeNull();
});
