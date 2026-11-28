import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { assert, expect } from "vite-plus/test";

import type { Database } from "@merit/db";

type Operation<T> = (db: Database) => Promise<T>;

type HeldCommand = Operation<{ status: string }>;

const backendPid = async (client: Client) => {
  const {
    rows: [backend],
  } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  assert(backend);
  return backend.pid;
};

const barrier = () => {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

/** Two independent connections plus the test database's observer, for proving real lock waits. */
export const openLockSessions = async (
  database: { connectionString: string; client: Client },
  onCleanup: (dispose: () => Promise<void>) => void,
) => {
  const options = { connectionString: database.connectionString, statement_timeout: 5000 };
  const holder = new Client(options);
  const competitor = new Client(options);
  const releases: (() => void)[] = [];
  const pending: Promise<unknown>[] = [];
  onCleanup(async () => {
    for (const release of releases) {
      release();
    }
    await Promise.allSettled(pending);
    await Promise.all([holder.end(), competitor.end()]);
  });
  await Promise.all([holder.connect(), competitor.connect()]);
  const [holderPid, competitorPid] = await Promise.all([
    backendPid(holder),
    backendPid(competitor),
  ]);
  const second = drizzle(competitor);

  const track = <T>(promise: Promise<T>) => {
    pending.push(promise.catch(() => undefined));
    return promise;
  };

  const hold = async (first: HeldCommand) => {
    const ready = barrier();
    const release = barrier();
    releases.push(release.open);
    const transaction = track(
      drizzle(holder).transaction(async (tx) => {
        expect(await first(tx)).toMatchObject({ status: "ok" });
        ready.open();
        await release.promise;
      }),
    );
    await Promise.race([ready.promise, transaction]);
    return async () => {
      release.open();
      await transaction;
    };
  };

  const finishBlocked = async <T>(competing: Promise<T>, commit: () => Promise<void>) => {
    const result = track(competing);
    await expect
      .poll(
        async () => {
          const result = await database.client.query<{ blockers: number[] }>(
            "SELECT pg_blocking_pids($1) AS blockers",
            [competitorPid],
          );
          return result.rows[0]?.blockers;
        },
        { timeout: 2500 },
      )
      .toContain(holderPid);
    await commit();
    return result;
  };

  const race = async <T>(first: HeldCommand, competing: Operation<T>) => {
    const commit = await hold(first);
    return finishBlocked(competing(second), commit);
  };

  return { second, hold, finishBlocked, race };
};
