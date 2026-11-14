import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assert, expect } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import type { Database } from "@merit/db";
import { actor } from "@merit/organizations/testing/workspace";
import { createFundingRound } from "@merit/rounds/server";

import type { NavigationTarget } from "../src/api/navigation";
import { createNavigationService } from "../src/server";
import { applicationWork } from "../src/server/persistence/commands/application-work";
import { roundTest as it } from "./round-test";

const service = (db: Database) =>
  createNavigationService({
    database: (operation) => operation(db),
    verifiedEmails: async () => [],
  });

it("supports personal pins with the documented restricted runtime privileges", async ({
  db,
  rounds,
}) => {
  const first = await rounds.createApplication("First pinned application");
  const second = await rounds.createApplication("Second pinned application");
  const firstTarget: NavigationTarget = { kind: "application", id: first.publicId };
  const secondTarget: NavigationTarget = { kind: "application", id: second.publicId };
  const role = `navigation_runtime_${randomUUID().replaceAll("-", "")}`;
  const rollback = new Error("Remove the temporary role and its grants");

  await expect(
    db.transaction(async (tx) => {
      // Rollback removes the cluster-scoped role even when an assertion fails.
      await tx.execute(
        sql.raw(
          `CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        ),
      );
      await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${role}`));
      await tx.execute(
        sql.raw(
          `GRANT SELECT ON app_users, memberships, organizations, funding_rounds, application_cases, material_versions TO ${role}`,
        ),
      );
      await tx.execute(sql.raw(`GRANT UPDATE (id) ON app_users TO ${role}`));
      await tx.execute(
        sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON grant_navigation_pins TO ${role}`),
      );
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));

      const navigation = service(tx);
      expect(await navigation.read(actor)).toEqual({ status: "ok", pins: [] });
      for (const target of [firstTarget, secondTarget]) {
        expect(await navigation.change(actor, { action: "pin", target })).toMatchObject({
          status: "ok",
        });
      }
      const moved = await navigation.change(actor, {
        action: "move",
        target: secondTarget,
        before: firstTarget,
      });
      assert(moved.status === "ok");
      expect(moved.pins.map((pin) => pin.target)).toEqual([secondTarget, firstTarget]);
      const remaining = await navigation.change(actor, { action: "unpin", target: firstTarget });
      assert(remaining.status === "ok");
      expect(remaining.pins.map((pin) => pin.target)).toEqual([secondTarget]);
      expect(await navigation.read(actor)).toEqual(remaining);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it("saves personal pins, allows multiple rounds, and retries pinning and ordering safely", async ({
  db,
  database,
  rounds,
}) => {
  const navigation = service(db);
  const another = await createFundingRound(db, actor, {
    workspaceSlug: "alder",
    requestId: randomUUID(),
    title: "Another round",
  });
  assert(another.status === "ok");
  const application = await rounds.createApplication("Community meals");
  const round: NavigationTarget = { kind: "round", id: rounds.pageInput.publicId };
  const second: NavigationTarget = { kind: "round", id: another.publicId };
  const app: NavigationTarget = { kind: "application", id: application.publicId };
  expect(await navigation.read(actor)).toEqual({ status: "ok", pins: [] });
  for (const target of [round, app, second, round]) {
    expect(await navigation.change(actor, { action: "pin", target })).toMatchObject({
      status: "ok",
    });
  }
  const initial = await navigation.read(actor);
  assert(initial.status === "ok");
  expect(initial.pins.map((pin) => pin.target)).toEqual([round, app, second]);
  expect(await service(db).read(actor)).toEqual(initial);
  expect(await navigation.read({ userId: "birch-manager" })).toEqual({ status: "ok", pins: [] });
  expect(
    await navigation.change({ userId: "birch-manager" }, { action: "pin", target: app }),
  ).toEqual({ status: "not_found" });
  for (let retry = 0; retry < 2; retry++) {
    const result = await navigation.change(actor, {
      action: "move",
      target: second,
      before: round,
    });
    assert(result.status === "ok");
    expect(
      result.pins.filter((pin) => pin.target.kind === "round").map((pin) => pin.target),
    ).toEqual([second, round]);
  }
  expect(await navigation.change(actor, { action: "move", target: second, before: app })).toEqual({
    status: "not_found",
  });
  expect(
    await navigation.change(actor, {
      action: "move",
      target: round,
      before: { kind: "round", id: "000000000001" },
    }),
  ).toEqual({ status: "not_found" });
  const moved = await navigation.change(actor, { action: "move", target: second, before: null });
  assert(moved.status === "ok");
  expect(moved.pins.filter((pin) => pin.target.kind === "round").map((pin) => pin.target)).toEqual([
    round,
    second,
  ]);
  for (let retry = 0; retry < 2; retry++) {
    expect(await navigation.change(actor, { action: "unpin", target: second })).toMatchObject({
      status: "ok",
    });
  }
  expect(
    (await database.client.query("SELECT count(*)::int AS count FROM grant_navigation_pins")).rows,
  ).toEqual([{ count: 2 }]);
});

it("resolves current labels, hides lost grant access, and cleans up deleted targets", async ({
  db,
  database,
  rounds,
}) => {
  const navigation = service(db);
  const address = await rounds.createApplication("Original application");
  const target: NavigationTarget = { kind: "application", id: address.publicId };
  await navigation.change(actor, { action: "pin", target });
  await editFundingApplication(
    db,
    actor,
    {
      ...address,
      expectedRevision: 0,
      change: { action: "save_content", content: { title: "Renamed application" } },
    },
    applicationWork,
  );
  expect(await navigation.read(actor)).toMatchObject({
    status: "ok",
    pins: [{ title: "Renamed application", context: "Community grants", workspaceSlug: "alder" }],
  });
  await database.client.query("UPDATE memberships SET role = 'member' WHERE user_id = 'dana'");
  expect(await navigation.read(actor)).toEqual({ status: "ok", pins: [] });
  expect(await navigation.change(actor, { action: "pin", target })).toEqual({
    status: "not_found",
  });
  expect(await navigation.change(actor, { action: "unpin", target })).toEqual({
    status: "ok",
    pins: [],
  });
  await database.client.query(
    "UPDATE memberships SET role = 'program_manager' WHERE user_id = 'dana'",
  );
  await navigation.change(actor, { action: "pin", target });
  await navigation.change(actor, {
    action: "pin",
    target: { kind: "round", id: rounds.pageInput.publicId },
  });
  await database.client.query("DELETE FROM application_cases WHERE id = $1", [address.publicId]);
  const remaining = await navigation.read(actor);
  assert(remaining.status === "ok");
  expect(remaining.pins.map((pin) => pin.target.kind)).toEqual(["round"]);
  await database.client.query("DELETE FROM funding_rounds WHERE id = $1", [
    rounds.pageInput.publicId,
  ]);
  expect(await navigation.read(actor)).toEqual({ status: "ok", pins: [] });
  expect(
    (await database.client.query("SELECT count(*)::int AS count FROM grant_navigation_pins")).rows,
  ).toEqual([{ count: 0 }]);
  await database.client.query("UPDATE app_users SET active = false WHERE id = 'dana'");
  expect(await navigation.read(actor)).toEqual({ status: "not_found" });
  expect(await navigation.change(actor, { action: "unpin", target })).toEqual({
    status: "not_found",
  });
  expect(await navigation.read({ userId: "missing" })).toEqual({ status: "not_found" });
});

it("keeps workspace orders independent even when one person can access both", async ({
  db,
  database,
  rounds,
}) => {
  await database.client.query(
    "INSERT INTO memberships (organization_id, user_id, role, administration) SELECT organization_id, 'dana', 'program_manager', 'none' FROM memberships WHERE user_id = 'birch-manager'",
  );
  const foreign = (
    await database.client.query<{ id: string }>(
      "SELECT id FROM funding_rounds WHERE organization_id = 'birch'",
    )
  ).rows[0]!;
  const navigation = service(db);
  const local: NavigationTarget = { kind: "round", id: rounds.pageInput.publicId };
  const other: NavigationTarget = { kind: "round", id: foreign.id };
  await navigation.change(actor, { action: "pin", target: local });
  await navigation.change(actor, { action: "pin", target: other });
  expect(await navigation.change(actor, { action: "move", target: local, before: other })).toEqual({
    status: "not_found",
  });
  const result = await navigation.read(actor);
  assert(result.status === "ok");
  expect(result.pins.map((pin) => pin.workspaceSlug)).toEqual(["alder", "birch"]);
});

it("runs pin reads in a read-only transaction", async ({ db }) => {
  const transaction: Database["transaction"] = (read, options) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`update organizations set name = name where false`);
      return read(tx);
    }, options);

  const guarded = new Proxy(db, {
    get(target, property, receiver): unknown {
      return property === "transaction" ? transaction : Reflect.get(target, property, receiver);
    },
  });
  await expect(service(guarded).read(actor)).rejects.toMatchObject({ cause: { code: "25006" } });
});

it("serializes concurrent pins without blocking the account locks used by grant work", async ({
  database,
  rounds,
}) => {
  const application = await rounds.createApplication("Concurrent application");
  const pool = new Pool({
    connectionString: database.connectionString,
    max: 4,
    statement_timeout: 3000,
  });
  let openClients = 0;
  let onDrained: (() => void) | undefined;
  pool.on("connect", () => {
    openClients += 1;
  });
  pool.on("remove", () => {
    openClients -= 1;
    if (openClients === 0) {
      onDrained?.();
    }
  });
  const grantWork = await pool.connect();
  try {
    await grantWork.query("BEGIN");
    await grantWork.query("SELECT id FROM app_users WHERE id = 'dana' FOR SHARE");
    const navigation = service(drizzle(pool));
    const round = { kind: "round" as const, id: rounds.pageInput.publicId };
    const app = { kind: "application" as const, id: application.publicId };
    const results = await Promise.all(
      [round, app, round].map((target) => navigation.change(actor, { action: "pin", target })),
    );
    expect(results.every((result) => result.status === "ok")).toBe(true);
    const result = await navigation.read(actor);
    assert(result.status === "ok");
    expect(result.pins).toHaveLength(2);
    expect(result.pins.map((pin) => pin.target)).toEqual(expect.arrayContaining([round, app]));
    expect(
      (await pool.query("SELECT position FROM grant_navigation_pins ORDER BY position")).rows,
    ).toEqual([{ position: 0 }, { position: 1 }]);
  } finally {
    await grantWork.query("ROLLBACK").catch(() => undefined);
    grantWork.release();
    await pool.end();
    if (openClients > 0) {
      await new Promise<void>((resolve) => {
        onDrained = resolve;
      });
    }
  }
});
