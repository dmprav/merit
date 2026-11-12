import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import type { NavigationPinsResult } from "../../api/navigation";
import { pinOwner, visibleNavigationPins } from "../persistence/navigation-records";

export const readNavigationPins = (
  db: Database,
  actor: Actor,
  emails: string[],
): Promise<NavigationPinsResult> =>
  readTransaction(db, async (tx) => {
    if (!(await pinOwner(tx, actor.userId))) {
      return { status: "not_found" };
    }
    return { status: "ok", pins: await visibleNavigationPins(tx, actor.userId, emails) };
  });
