import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";

import type { DemoOperations } from "./demo-operations";

const readyDemoSchema = z.object({
  status: z.literal("ready"),
  workspaceId: z.string(),
  workspaceSlug: z.string(),
  expiresAt: z.iso.datetime(),
  applicationRef: z.string().optional(),
  roundRef: z.string().optional(),
});

export const createDemoTools = (actor: Actor, demo: DemoOperations) => {
  const errorSchema = z.object({ status: z.enum(["expired", "unavailable", "limited"]) });

  const presentStart = (state: Awaited<ReturnType<DemoOperations["start"]>>) =>
    state.status === "ready"
      ? { status: "ok" as const, demo: state }
      : state.status === "empty"
        ? { status: "unavailable" as const }
        : { status: state.status };

  return [
    defineActorTool(
      actor,
      "start_demo",
      {
        inputSchema: z.strictObject({ fresh: z.boolean().default(false) }),
        outputSchema: z.object({ status: z.literal("ok"), demo: readyDemoSchema }),
        errorSchema,
        description:
          "Start or resume your account's isolated fictional demo. Set fresh to start again after expiry. An active demo is preserved. Expires after seven days; entry rate limits apply.",
      },
      async (input) => presentStart(await demo.start(actor, input)),
    ),
  ];
};

export type { DemoOperations } from "./demo-operations";
