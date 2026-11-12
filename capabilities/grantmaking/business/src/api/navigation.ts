import { z } from "zod";

import type { Actor } from "@merit/auth";

import type { NavigationPin } from "../domain/navigation";
import { publicIdSchema } from "./identifiers";

export type { NavigationPin, NavigationTarget } from "../domain/navigation";
export { sameNavigationTarget, sameNavigationSection } from "../domain/navigation";

export const navigationTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("round"), id: publicIdSchema }).strict(),
  z.object({ kind: z.literal("application"), id: publicIdSchema }).strict(),
  z.object({ kind: z.literal("review"), id: z.uuid() }).strict(),
]);

export const changeNavigationPinSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pin"), target: navigationTargetSchema }).strict(),
  z.object({ action: z.literal("unpin"), target: navigationTargetSchema }).strict(),
  z
    .object({
      action: z.literal("move"),
      target: navigationTargetSchema,
      before: navigationTargetSchema.nullable(),
    })
    .strict(),
]);

export type NavigationPinChange = z.infer<typeof changeNavigationPinSchema>;

export type NavigationPinsResult =
  | { status: "ok"; pins: NavigationPin[] }
  | { status: "not_found" };

export interface NavigationService {
  read: (actor: Actor) => Promise<NavigationPinsResult>;
  change: (actor: Actor, input: NavigationPinChange) => Promise<NavigationPinsResult>;
}
