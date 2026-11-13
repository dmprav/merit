import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { assert, describe, expect } from "vite-plus/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { editFundingApplication } from "@merit/applications/server";
import { roundHasApplications } from "@merit/applications/server/integrations";
import { recordAuditEvent } from "@merit/audit/server/record";
import { changeWorkspaceContact } from "@merit/contacts/server";
import { actor } from "@merit/organizations/testing/workspace";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { saveApplicationReview } from "@merit/reviews/server";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { createFundingRound, deleteFundingRound } from "@merit/rounds/server";

import { listWorkspaceActivity } from "../src/server";
import { fundingRoundContactUsage } from "../src/server/integrations";
import { applicationWork } from "../src/server/persistence/commands/application-work";
import { roundTest } from "./round-test";

const workspaceSlug = "alder";

const it = roundTest.extend("activity", async ({ db, database, rounds }) => {
  await database.client.query("INSERT INTO app_users (id, name) VALUES ('pat', 'Pat Taylor')");
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'pat', 'program_manager')",
  );
  const pat = { userId: "pat", provenance: { interface: "mcp" as const, clientId: "assistant" } };
  const first = await rounds.createApplication("Workshop Saturdays");
  const second = await rounds.createApplication("Neighbour Table");
  const roundId = rounds.pageInput.publicId;
  const otherRound = await createFundingRound(
    db,
    pat,
    { workspaceSlug, requestId: randomUUID(), title: "Winter grants" },
    recordAuditEvent,
  );
  assert(otherRound.status === "ok");

  const rename = async (address: { publicId: string }, title: string) => {
    const page = await database.client.query<{ revision: number }>(
      "SELECT revision FROM application_cases WHERE id = $1",
      [address.publicId],
    );
    return editFundingApplication(
      db,
      actor,
      {
        workspaceSlug,
        publicId: address.publicId,
        expectedRevision: page.rows[0]!.revision,
        change: { action: "save_content", content: { title } },
      },
      applicationWork,
      recordAuditEvent,
    );
  };

  const contact = await changeWorkspaceContact(
    db,
    actor,
    {
      workspaceSlug,
      action: "create",
      contactId: randomUUID(),
      details: { name: "Sam", email: "", affiliation: "" },
    },
    fundingRoundContactUsage,
  );
  assert(contact.status === "ok");
  const assessmentId = randomUUID();
  const recorded = await saveApplicationReview(
    db,
    actor,
    {
      workspaceSlug,
      publicId: first.publicId,
      expectedRevision: reviewRevisionSchema.parse(0),
      expectedApplicationVersion: materialVersionSchema.parse(1),
      expectedCriteriaVersion: criteriaVersionSchema.parse(1),
      change: {
        action: "record",
        id: assessmentId,
        contactId: contact.contact.id,
        requestId: null,
        previousId: null,
        content: {
          applicationVersion: materialVersionSchema.parse(1),
          criteriaVersion: criteriaVersionSchema.parse(1),
          date: null,
          position: "Fund",
          amount: "18000",
          reasoning: "Practical plan.",
          observations: [],
        },
      },
    },
    recordAuditEvent,
  );
  assert(recorded.status === "ok");
  await rounds.recommendApplication(first, "5000");

  const read = async (
    input: Partial<Parameters<typeof listWorkspaceActivity>[2]> = {},
    as: { userId: string } = actor,
  ) => listWorkspaceActivity(db, as, { workspaceSlug, ...input });

  const ok = async (input: Parameters<typeof read>[0] = {}) => {
    const result = await read(input);
    assert(result.status === "ok");
    return result;
  };

  const summary = (entry: Awaited<ReturnType<typeof ok>>["entries"][number]) =>
    `${entry.action} ${entry.record ? `${entry.record.kind}:${entry.record.title}` : "gone"}`;

  return {
    pat,
    first,
    second,
    roundId,
    otherRoundId: otherRound.publicId,
    assessmentId,
    rename,
    read,
    ok,
    summary,
  };
});

describe("workspace activity", () => {
  it("lists changes newest first with each record's current title", async ({ activity: a }) => {
    expect(await a.rename(a.second, "Neighbour Table (renamed)")).toMatchObject({ status: "ok" });
    const { entries, nextCursor } = await a.ok();

    expect(nextCursor).toBeNull();
    expect(entries.map(a.summary).sort()).toEqual(
      [
        "round.create round:Community grants",
        "round.create round:Winter grants",
        "application.create application:Workshop Saturdays",
        "application.create application:Neighbour Table (renamed)",
        "assessment.recorded application:Workshop Saturdays",
        "recommendation.saved application:Workshop Saturdays",
        "application.mark_ready application:Workshop Saturdays",
      ].sort(),
    );
    const times = entries.map((entry) => entry.recordedAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(
      entries.find((entry) => entry.action === "round.create" && entry.actor === "Pat Taylor"),
    ).toMatchObject({
      provenance: a.pat.provenance,
      record: { kind: "round", id: a.otherRoundId, title: "Winter grants" },
    });
    expect(entries.find((entry) => entry.action === "assessment.recorded")).toMatchObject({
      actor: "Dana Reed",
      provenance: { interface: "web" },
      record: { kind: "application", id: a.first.publicId },
    });
  });

  it("shows records that no longer exist without a link target, and unknown actions as recorded", async ({
    db,
    database,
    activity: a,
  }) => {
    const removed = await editFundingApplication(
      db,
      actor,
      {
        workspaceSlug,
        publicId: a.second.publicId,
        expectedRevision: 0,
        change: { action: "delete" },
      },
      applicationWork,
      recordAuditEvent,
    );
    assert(removed.status === "ok");
    await database.client.query(
      `INSERT INTO audit_events (organization_id, actor_user_id, actor_name, provenance, action, target_type, target_id, target_revision)
       VALUES ('alder', 'dana', 'Dana Reed', '{"interface":"web"}', 'widget.polished', 'widget', 'w1', 1)`,
    );
    const { entries } = await a.ok();

    // Deleted records belong to no round, so the Round filter omits their events.
    const inRound = (await a.ok({ roundId: a.roundId })).entries.map((entry) => entry.action);
    expect(inRound).not.toContain("application.delete");
    expect(inRound.filter((action) => action === "application.create")).toHaveLength(1);

    expect(
      entries
        .filter((entry) => entry.record === null)
        .map((entry) => entry.action)
        .sort(),
    ).toEqual(["application.create", "application.delete", "widget.polished"]);
    expect(entries.find((entry) => entry.action === "widget.polished")).toMatchObject({
      record: null,
    });
  });

  it("pages by a stable cursor without repeating or skipping entries", async ({ activity: a }) => {
    const all = (await a.ok()).entries;
    expect(all.length).toBeGreaterThan(4);
    const seen: string[] = [];
    let after: string | undefined;
    do {
      const page = await a.ok({ limit: 2, after });
      expect(page.entries.length).toBeLessThanOrEqual(2);
      seen.push(...page.entries.map((entry) => entry.id));
      after = page.nextCursor ?? undefined;
    } while (after);

    expect(seen).toEqual(all.map((entry) => entry.id));
  });

  it("treats an undecodable cursor as invalid input rather than a failure", async ({
    activity: a,
  }) => {
    expect(await a.read({ after: "abc" })).toEqual({ status: "invalid" });
    // A malformed shape never reaches audit.
    await expect(a.read({ after: "***" })).rejects.toThrow();
  });

  it("filters by round, matching its applications, assessments and recommendations", async ({
    activity: a,
  }) => {
    const round = await a.ok({ roundId: a.roundId });
    expect(round.entries.map(a.summary).sort()).toEqual(
      [
        "round.create round:Community grants",
        "application.create application:Workshop Saturdays",
        "application.create application:Neighbour Table",
        "assessment.recorded application:Workshop Saturdays",
        "recommendation.saved application:Workshop Saturdays",
        "application.mark_ready application:Workshop Saturdays",
      ].sort(),
    );
    expect((await a.ok({ roundId: a.otherRoundId })).entries.map(a.summary)).toEqual([
      "round.create round:Winter grants",
    ]);
    expect((await a.ok({ roundId: "0123456789ab" })).entries).toEqual([]);
    expect((await a.ok({ roundId: a.roundId, limit: 2 })).nextCursor).not.toBeNull();
  });

  it("omits a deleted round's own events from its Round filter", async ({ db, activity: a }) => {
    const removed = await deleteFundingRound(
      db,
      actor,
      { workspaceSlug, publicId: a.otherRoundId, expectedRevision: 0 },
      roundHasApplications,
      recordAuditEvent,
    );
    expect(removed).toEqual({ status: "ok" });

    expect((await a.ok({ roundId: a.otherRoundId })).entries).toEqual([]);
    expect((await a.ok()).entries.map((entry) => entry.action)).toContain("round.delete");
  });

  it("filters by person, combines with round, and lists everyone with recorded activity", async ({
    activity: a,
  }) => {
    const byPat = await a.ok({ personId: "pat" });
    expect(byPat.entries.map(a.summary)).toEqual(["round.create round:Winter grants"]);
    expect(byPat.people).toEqual([
      { id: "dana", name: "Dana Reed" },
      { id: "pat", name: "Pat Taylor" },
    ]);
    expect((await a.ok({ personId: "pat", roundId: a.roundId })).entries).toEqual([]);
    expect((await a.ok({ personId: "dana", roundId: a.otherRoundId })).entries).toEqual([]);
    expect((await a.ok({ personId: "nobody" })).entries).toEqual([]);
  });

  it("is available only to current program managers of the workspace", async ({
    database,
    activity: a,
  }) => {
    await database.client.query("INSERT INTO app_users (id, name) VALUES ('rae', 'Rae')");
    await database.client.query(
      "INSERT INTO memberships (organization_id, user_id, role) VALUES ('alder', 'rae', 'member')",
    );
    expect(await a.read({}, { userId: "rae" })).toEqual({ status: "forbidden" });
    expect(await a.read({}, { userId: "stranger" })).toEqual({ status: "not_found" });
    expect(await a.read({ workspaceSlug: "missing" })).toEqual({ status: "not_found" });
    // Another workspace's manager sees only their own workspace's activity.
    expect(await a.read({}, { userId: "birch-manager" })).toEqual({ status: "not_found" });
    expect(await a.read({ workspaceSlug: "birch" }, { userId: "birch-manager" })).toMatchObject({
      status: "ok",
      entries: [{ action: "round.create", actor: "Birch manager" }],
      people: [{ id: "birch-manager", name: "Birch manager" }],
    });
    expect(await a.read({ workspaceSlug: "birch" })).toEqual({ status: "not_found" });
  });

  it("reads with a restricted runtime role that needs only SELECT on audit_events", async ({
    db,
    activity: a,
  }) => {
    const role = `runtime_test_${randomUUID().replaceAll("-", "")}`;
    const rollback = new Error("Roll back the temporary runtime role and its grants");

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(
            `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
          ),
        );
        await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
        await tx.execute(
          sql.raw(
            `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, application_cases, material_versions, assessments TO ${role}`,
          ),
        );
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        await expect(
          listWorkspaceActivity(tx, actor, { workspaceSlug, roundId: a.roundId }),
        ).rejects.toMatchObject({ cause: { code: "42501" } });

        await tx.execute(sql`SET LOCAL ROLE NONE`);
        await tx.execute(sql.raw(`GRANT SELECT ON audit_events TO ${role}`));
        await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
        const result = await listWorkspaceActivity(tx, actor, {
          workspaceSlug,
          roundId: a.roundId,
        });

        assert(result.status === "ok");
        expect(result.entries.length).toBeGreaterThan(0);
        expect(
          (
            await tx.execute(
              sql`SELECT has_table_privilege(current_user, 'audit_events', 'INSERT') AS insert`,
            )
          ).rows,
        ).toEqual([{ insert: false }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
