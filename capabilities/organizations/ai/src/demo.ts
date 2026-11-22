import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";

import type { DemoOperations } from "./demo-operations";
import type { WorkspaceOperations } from "./operations";

const readyDemoSchema = z.object({
  status: z.literal("ready"),
  workspaceId: z.string(),
  workspaceSlug: z.string(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
  applicationRef: z.string().optional(),
  roundRef: z.string().optional(),
});

export const createDemoTools = (
  actor: Actor,
  demo: DemoOperations,
  workspaceHomeUrl: WorkspaceOperations["workspaceHomeUrl"],
) => [
  defineActorTool(
    actor,
    "start_demo",
    {
      inputSchema: z.strictObject({ fresh: z.boolean().default(false) }),
      outputSchema: z.object({ status: z.literal("ok"), demo: readyDemoSchema }),
      errorSchema: z.object({ status: z.enum(["expired", "unavailable", "limited"]) }),
      description:
        "Start or resume your account's isolated fictional demo. Link to demo.url to take the user to their workspace. Set fresh to start again after expiry. An active demo is preserved. Expires after seven days; entry rate limits apply.",
    },
    async (input) => {
      const state = await demo.start(actor, input);
      if (state.status !== "ready") {
        return state;
      }
      const url = workspaceHomeUrl({
        slug: state.workspaceSlug,
        canWorkOnGrants: true,
        canViewTeam: true,
      });
      return { status: "ok" as const, demo: { ...state, url } };
    },
  ),
];

export type { DemoOperations } from "./demo-operations";
