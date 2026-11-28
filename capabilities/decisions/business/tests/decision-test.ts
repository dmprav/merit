import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { assert, expect } from "vite-plus/test";

import { editFundingApplication } from "@merit/applications/server";
import { noApplicationWork } from "@merit/applications/testing";
import { type Database } from "@merit/db";
import type { RecordDecisionRequest } from "@merit/decisions/api";
import { recordCommitteeDecision } from "@merit/decisions/server";
import { actor } from "@merit/organizations/testing/workspace";

export const today = () => new Date().toISOString().slice(0, 10);

export const decisionOf = (
  overrides: Partial<RecordDecisionRequest["decision"]> = {},
): RecordDecisionRequest["decision"] => ({
  outcome: "Fund",
  amount: { minorUnits: "5000", currency: "EUR" },
  conditions: "",
  reason: "Meets the round's priorities.",
  decidedBy: "Funding committee",
  decisionDate: today(),
  ...overrides,
});

type Address = { workspaceSlug: string; publicId: string };

export const createDecisionCases = async (
  db: Database,
  createApplication: (title: string) => Promise<Address>,
) => {
  const ready = async (title: string) => {
    const address = await createApplication(title);
    const marked = await editFundingApplication(
      db,
      actor,
      { ...address, expectedRevision: 0, change: { action: "mark_ready" } },
      noApplicationWork,
    );
    assert(marked.status === "ok", "Could not mark the fixture ready");
    return address;
  };

  const first = await ready("First application");
  const second = await ready("Second application");
  const preparing = await createApplication("Still in preparation");

  const record = (
    address: { workspaceSlug: string; publicId: string },
    decision: Partial<RecordDecisionRequest["decision"]>,
    expectedRevision = 0,
    as: Parameters<typeof recordCommitteeDecision>[1] = actor,
  ) =>
    recordCommitteeDecision(db, as, {
      ...address,
      expectedRevision,
      decision: decisionOf(decision),
    });

  return { first, second, preparing, record };
};

/**
 * Holds `first` open in a transaction, starts `competing` on another connection, and returns
 * its result once the first commits. The competitor must wait on the first transaction, so a
 * weaker lock than the one decisions rely on fails here instead of passing by luck.
 */
export const raceHeld = async <T>(
  database: { connectionString: string; client: Client },
  first: (tx: Database) => Promise<{ status: string }>,
  competing: (connection: Database) => Promise<T>,
) => {
  const options = { connectionString: database.connectionString, statement_timeout: 5000 };
  const holder = new Client(options);
  const competitor = new Client(options);
  try {
    await Promise.all([holder.connect(), competitor.connect()]);

    const pid = async (client: Client) => {
      const row = (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0];
      assert(row, "Could not read the backend");
      return row.pid;
    };

    const [holderPid, competitorPid] = [await pid(holder), await pid(competitor)];
    return await holdAndRace({
      database,
      holder,
      competitor,
      holderPid,
      competitorPid,
      first,
      competing,
    });
  } finally {
    await Promise.all([holder.end(), competitor.end()]);
  }
};

const holdAndRace = async <T>(input: {
  database: { client: Client };
  holder: Client;
  competitor: Client;
  holderPid: number;
  competitorPid: number;
  first: (tx: Database) => Promise<{ status: string }>;
  competing: (connection: Database) => Promise<T>;
}) => {
  const { database, holder, competitor, holderPid, competitorPid, first, competing } = input;
  let release!: () => void;
  let opened!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const held = new Promise<void>((resolve) => (opened = resolve));
  const transaction = drizzle(holder).transaction(async (tx) => {
    expect(await first(tx)).toMatchObject({ status: "ok" });
    opened();
    await released;
  });
  const settled = transaction.catch(() => undefined);
  try {
    await Promise.race([held, transaction]);
    const result = competing(drizzle(competitor));
    const settledResult = result.catch(() => undefined);
    await expect
      .poll(
        async () =>
          (
            await database.client.query<{ blockers: number[] }>(
              "SELECT pg_blocking_pids($1) AS blockers",
              [competitorPid],
            )
          ).rows[0]?.blockers,
        { timeout: 2500 },
      )
      .toContain(holderPid);
    release();
    await transaction;
    const outcome = await result;
    await settledResult;
    return outcome;
  } finally {
    release();
    await settled;
  }
};
