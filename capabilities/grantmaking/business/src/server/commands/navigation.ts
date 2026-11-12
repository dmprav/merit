import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import {
  changeNavigationPinSchema,
  type NavigationPinChange,
  type NavigationPinsResult,
} from "../../api/navigation";
import { reorderNavigationPins } from "../../domain/navigation";
import {
  insertNavigationPin,
  lockNavigationPins,
  removeNavigationPin,
  positionNavigationPin,
} from "../persistence/commands/navigation";
import {
  pinOwner,
  resolveNavigationTargets,
  storedPins,
  visibleNavigationPins,
} from "../persistence/navigation-records";

export const changeNavigationPin = (
  db: Database,
  actor: Actor,
  emails: string[],
  input: NavigationPinChange,
): Promise<NavigationPinsResult> =>
  db.transaction(async (tx) => {
    const change = changeNavigationPinSchema.parse(input);
    // Serialize personal ordering without taking an exclusive account lock ahead of grant work.
    await lockNavigationPins(tx, actor.userId);
    if (!(await pinOwner(tx, actor.userId, true))) {
      return { status: "not_found" };
    }
    if (change.action === "unpin") {
      await removeNavigationPin(tx, actor.userId, change.target);
    } else {
      const [target] = await resolveNavigationTargets(tx, actor.userId, emails, [change.target]);
      if (!target) {
        return { status: "not_found" };
      }
      if (change.action === "pin") {
        const positions = (await storedPins(tx, actor.userId)).map((pin) => pin.position);
        await insertNavigationPin(tx, actor.userId, change.target, Math.max(-1, ...positions) + 1);
      } else {
        const pins = await visibleNavigationPins(tx, actor.userId, emails);
        const reordered = reorderNavigationPins(pins, change.target, change.before);
        if (!reordered) {
          return { status: "not_found" };
        }
        for (const [position, pin] of reordered.entries()) {
          await positionNavigationPin(tx, actor.userId, pin.target, position);
        }
      }
    }
    return { status: "ok", pins: await visibleNavigationPins(tx, actor.userId, emails) };
  });
