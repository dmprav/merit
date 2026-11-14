import { z } from "zod";

import type { RegisterTool } from "../../components/register-tool";
import { readAnnotations, writeAnnotations } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import type { DemoOperations } from "./operations";

const readyDemoSchema = z.object({
  status: z.literal("ready"),
  workspaceId: z.string(),
  workspaceSlug: z.string(),
  expiresAt: z.iso.datetime(),
  applicationRef: z.string().optional(),
  roundRef: z.string().optional(),
});

const demoStateSchema = z.discriminatedUnion("status", [
  readyDemoSchema,
  z.object({ status: z.enum(["empty", "expired"]) }),
]);

export const registerDemoTools = (
  register: RegisterTool,
  actor: McpActor,
  demo: DemoOperations,
) => {
  const errorSchema = z.object({ status: z.enum(["expired", "unavailable", "limited"]) });

  const presentRead = (state: Awaited<ReturnType<DemoOperations["read"]>>) =>
    state.status === "ready"
      ? { status: "ok" as const, demo: state }
      : state.status === "empty" || state.status === "expired"
        ? { status: "ok" as const, demo: { status: state.status } }
        : { status: state.status };

  const presentStart = (state: Awaited<ReturnType<DemoOperations["start"]>>) =>
    state.status === "ready"
      ? { status: "ok" as const, demo: state }
      : state.status === "empty"
        ? { status: "unavailable" as const }
        : { status: state.status };

  register(
    "get_demo",
    {
      scope: "onboarding:read",
      annotations: readAnnotations,
      inputSchema: z.strictObject({}),
      outputSchema: z.object({ status: z.literal("ok"), demo: demoStateSchema }),
      errorSchema,
      description:
        "Read your account's demo status and workspaceId for a reset. Does not create data. Browser guest cookies are not used.",
    },
    async () => presentRead(await demo.read(actor)),
  );
  register(
    "start_demo",
    {
      scope: "onboarding:write",
      annotations: { ...writeAnnotations, destructiveHint: false },
      inputSchema: z.strictObject({ fresh: z.boolean().default(false) }),
      outputSchema: z.object({ status: z.literal("ok"), demo: readyDemoSchema }),
      errorSchema,
      description:
        "Start or resume your account's isolated fictional demo. Set fresh to start again after expiry. An active demo is preserved. Expires after seven days; entry rate limits apply.",
    },
    async (input) => presentStart(await demo.start(actor, input)),
  );
  register(
    "reset_demo",
    {
      scope: "onboarding:write",
      annotations: writeAnnotations,
      inputSchema: z.strictObject({ resetWorkspaceId: z.string().min(1).max(100) }),
      outputSchema: z.object({ status: z.literal("ok"), demo: readyDemoSchema }),
      errorSchema,
      description:
        "Replace all progress in your current demo with a fresh example. Read get_demo first and retain that workspaceId as resetWorkspaceId on retries so a retry cannot reset the replacement. Other workspaces are unaffected.",
    },
    async (input) => presentStart(await demo.start(actor, { ...input, fresh: true })),
  );
};
