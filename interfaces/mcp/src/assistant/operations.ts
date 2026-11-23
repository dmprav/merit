import type { Actor } from "@merit/auth";
import type { WorkspaceOperations } from "@merit/organizations-ai";

import type { McpOperations } from "../app/operations";

export type AssistantWorkspace = Awaited<
  ReturnType<WorkspaceOperations["workspacesPage"]>
>["value"][number];

export type AssistantOperations = Omit<McpOperations, "demo"> & {
  readWorkspace(actor: Actor, slug: string): Promise<AssistantWorkspace | null>;
};

export type AssistantContext = { actor: Actor; workspaceSlug: string; ops: AssistantOperations };
