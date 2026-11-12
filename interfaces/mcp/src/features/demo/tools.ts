import { z } from "zod";

import type { RegisterTool } from "../../components/register-tool";
import { readAnnotations, writeAnnotations } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import type { DemoOperations } from "./operations";

const demoStateSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ready"),
    workspaceId: z.string(),
    workspaceSlug: z.string(),
    expiresAt: z.iso.datetime(),
    applicationRef: z.string().optional(),
    roundRef: z.string().optional(),
  }),
  z.object({ status: z.enum(["empty", "expired", "unavailable", "limited"]) }),
]);

export const registerDemoTools = (
  register: RegisterTool,
  actor: McpActor,
  demo: DemoOperations,
) => {
  const outputSchema = z.object({ status: z.literal("ok"), value: demoStateSchema });
  const errorSchema = z.object({ status: z.enum(["expired", "unavailable", "limited"]) });

  const present = (state: z.infer<typeof demoStateSchema>, writing = false) =>
    state.status === "unavailable" ||
    state.status === "limited" ||
    (writing && state.status === "expired")
      ? { status: state.status as "expired" | "unavailable" | "limited" }
      : { status: "ok" as const, value: state };

  register(
    "get_demo",
    {
      scope: "onboarding:read",
      annotations: readAnnotations,
      inputSchema: z.strictObject({}),
      outputSchema,
      errorSchema,
      description:
        "Read your account's demo status and workspaceId for a reset. Does not create data. Browser guest cookies are not used.",
    },
    async () => present(await demo.read(actor)),
  );
  register(
    "start_demo",
    {
      scope: "onboarding:write",
      annotations: { ...writeAnnotations, destructiveHint: false },
      inputSchema: z.strictObject({ fresh: z.boolean().default(false) }),
      outputSchema,
      errorSchema,
      description:
        "Start or resume your account's isolated fictional demo. Set fresh to start again after expiry. An active demo is preserved. Expires after seven days; entry rate limits apply.",
    },
    async (input) => present(await demo.start(actor, input), true),
  );
  register(
    "reset_demo",
    {
      scope: "onboarding:write",
      annotations: writeAnnotations,
      inputSchema: z.strictObject({ resetWorkspaceId: z.string().min(1).max(100) }),
      outputSchema,
      errorSchema,
      description:
        "Replace all progress in your current demo with a fresh example. Read get_demo first and retain that workspaceId as resetWorkspaceId on retries so a retry cannot reset the replacement. Other workspaces are unaffected.",
    },
    async (input) => present(await demo.start(actor, { ...input, fresh: true }), true),
  );
};
