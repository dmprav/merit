import type { Actor, Identity } from "@merit/auth";
import { createGuestSession, renewGuestSession } from "@merit/auth/server";
import type { DatabaseRunner } from "@merit/db";
import { fundingExampleAuthor } from "@merit/grantmaking/server/demo";
import { readDemoWorkspace, allowDemoEntry } from "@merit/organizations/server/demo";
import type { DemoServices } from "@merit/product/context";
import { reportError } from "@merit/telemetry/errors";

import { demoDestination, seedDemoWorkspace } from "./demo-workspace.server";

const guestCookieName = "merit-demo-session";

export const demoCookie = (request: Request) =>
  request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${guestCookieName}=`))
    ?.slice(guestCookieName.length + 1);

export const createDemoServices = (
  database: DatabaseRunner,
  identity: () => Promise<Identity>,
  guestToken: string | undefined,
  isGuest: () => Promise<boolean>,
  networkAddress?: string,
): DemoServices => {
  return {
    read: async () => {
      try {
        const current = await identity();
        if (current.status === "unavailable") {
          return { status: "unavailable" };
        }
        if (current.status !== "authenticated") {
          return { status: guestToken ? "expired" : "empty" };
        }

        const result = await database((db) => readDemoWorkspace(db, current.actor));
        return result.status === "ready"
          ? demoDestination(database, result.workspace, current.actor)
          : result;
      } catch {
        return { status: "unavailable" };
      }
    },
    start: async (input) => {
      try {
        if (networkAddress && !(await database((db) => allowDemoEntry(db, networkAddress)))) {
          return { state: { status: "limited" } };
        }

        const current = await identity();
        if (current.status === "unavailable") {
          return { state: { status: "unavailable" } };
        }
        if (current.status === "signed_out" && guestToken && !input.fresh) {
          return { state: { status: "expired" } };
        }

        const provisioned = await provisionDemo(database, current, input);
        const { actor, result } = provisioned;
        let { cookie } = provisioned;
        if (result.status !== "ready") {
          return { state: result, cookie };
        }

        if (!cookie && guestToken && (await isGuest())) {
          const session = await database((db) => renewGuestSession(db, guestToken));
          if (session) {
            cookie = { token: guestToken, expiresAt: session.expiresAt };
          }
        }

        return { state: await demoDestination(database, result.workspace, actor), cookie };
      } catch (error) {
        reportError(error, { surface: "demo", operation: "demo.start" });
        return { state: { status: "unavailable" } };
      }
    },
  };
};

const provisionDemo = (
  database: DatabaseRunner,
  current: Identity,
  input: Parameters<DemoServices["start"]>[0],
) =>
  database((db) =>
    db.transaction(async (tx) => {
      let cookie: { token: string; expiresAt: Date } | undefined;
      let actor: Actor;
      if (current.status === "authenticated") {
        actor = current.actor;
      } else {
        const session = await createGuestSession(tx, fundingExampleAuthor.name);
        cookie = session;
        actor = { userId: session.userId };
      }
      const result = await seedDemoWorkspace(tx, actor, input);

      return { actor, result, cookie };
    }),
  );
