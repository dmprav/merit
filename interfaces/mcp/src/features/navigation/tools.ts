import { z } from "zod";

import { changeNavigationPinSchema, type NavigationService } from "@merit/grantmaking/api";

import type { RegisterTool } from "../../components/register-tool";
import { readAnnotations, writeAnnotations } from "../../components/tool-options";
import type { McpActor } from "../../contracts";

const pinsSchema = z.object({
  status: z.literal("ok"),
  pins: z.array(
    z.object({
      target: z.object({ kind: z.enum(["round", "application", "review"]), id: z.string() }),
      title: z.string(),
      context: z.string().nullable(),
      workspaceSlug: z.string().nullable(),
    }),
  ),
});

export const registerNavigationTools = (
  register: RegisterTool,
  actor: McpActor,
  navigation: NavigationService,
) => {
  const result = {
    outputSchema: pinsSchema,
    errorSchema: z.object({ status: z.literal("not_found") }),
  };
  register(
    "get_navigation_pins",
    {
      ...result,
      scope: "profile:read",
      annotations: readAnnotations,
      inputSchema: z.strictObject({}),
      description:
        "Read your ordered personal shortcuts. Inaccessible targets are hidden. Pins do not grant access.",
    },
    () => navigation.read(actor),
  );
  register(
    "change_navigation_pin",
    {
      ...result,
      scope: "profile:write",
      annotations: writeAnnotations,
      inputSchema: changeNavigationPinSchema,
      description:
        "Pin, unpin, or move your shortcut before another in the same section (null moves to the end). Does not change grant work or access. Safe to retry.",
    },
    (input) => navigation.change(actor, input),
  );
};
