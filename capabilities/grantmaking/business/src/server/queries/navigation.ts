import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readScoped } from "@merit/organizations/transactions";

import type { NavigationPinsResult } from "../../api/navigation";
import { pinOwner, visibleNavigationPins } from "../persistence/navigation-records";

export const readNavigationPins = (db: Database, actor: Actor): Promise<NavigationPinsResult> =>
  readScoped(db, { kind: "discovery", userId: actor.userId }, async (tx) => {
    if (!(await pinOwner(tx, actor.userId))) {
      return { status: "not_found" };
    }
    return { status: "ok", pins: await visibleNavigationPins(tx, actor.userId) };
  });
