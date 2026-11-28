import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import type { Actor } from "@merit/auth";

import { publication } from "../app/publication";
import { workspaceCatalog } from "../app/tools";
import { permitsAll, workspacePermits } from "./authority";
import {
  fields,
  receipt,
  type AssistantCatalog,
  type AssistantPreview,
  type AssistantReceipt,
} from "./contracts";
import { describeResult } from "./evidence";
import type { AssistantContext, AssistantOperations } from "./operations";
import { assistantPolicy } from "./policy";
import { prepareWrite } from "./preview";

export type { AssistantOperations } from "./operations";

export {
  assistantDependencySchema,
  assistantCitationSchema,
  assistantPreviewSchema,
  type AssistantCatalog,
  type AssistantPreview,
  type AssistantDependency,
  type AssistantReceipt,
  type AssistantCitation,
} from "./contracts";

type Definition = ReturnType<typeof workspaceCatalog>[number];

const schemaOf = (definition: Definition) => {
  const schema = definition.inputSchema;
  if (!(schema instanceof z.ZodType)) {
    throw new Error("A workspace tool must provide a Zod input schema.");
  }
  return schema;
};

const providerDefinition = (definition: Definition) => {
  const schema = z.toJSONSchema(schemaOf(definition), { io: "input", unrepresentable: "any" });
  const { workspaceSlug: _bound, ...properties } = schema.properties ?? {};
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: {
      ...schema,
      properties,
      required: schema.required?.filter((name) => name !== "workspaceSlug"),
    },
    write: !publication[definition.name].annotations.readOnlyHint,
  };
};

const scopedDefinitions = ({ actor, ops, workspaceSlug }: AssistantContext, origin: string) => {
  return workspaceCatalog(
    actor,
    {
      ...ops,
      organizations: {
        ...ops.organizations,
        workspacesPage: async (_, input) => {
          const workspace = await ops.readWorkspace(actor, workspaceSlug);
          return {
            status: "ok",
            value:
              workspace?.slug === workspaceSlug && (!input.after || workspace.id > input.after)
                ? [workspace]
                : [],
            nextCursor: null,
          };
        },
      },
    },
    origin,
  );
};

const resolveTool = async (
  ctx: AssistantContext,
  definitions: Definition[],
  name: string,
  input: Record<string, unknown>,
  write: boolean,
) => {
  const { workspaceSlug } = ctx;
  const tool = definitions.find((definition) => definition.name === name);
  if (!tool || publication[tool.name].annotations.readOnlyHint === write) {
    return { error: "invalid_input" } as const;
  }
  if (!(await permitsAll(ctx, [{ kind: assistantPolicy[tool.name].access }]))) {
    return { error: "forbidden" } as const;
  }
  if (input.workspaceSlug !== undefined && input.workspaceSlug !== workspaceSlug) {
    return { error: "invalid_input" } as const;
  }
  const bound = tool.name === "list_workspaces" ? input : { ...input, workspaceSlug };
  const parsed = schemaOf(tool).safeParse(bound);
  if (!parsed.success) {
    return { error: "invalid_input" } as const;
  }
  // The capability tool parses its own input. Preserve input-side types for transforms.
  return { tool, input: bound } as const;
};

const deliveryOutcome = async (
  observation: AssistantReceipt,
  approved: AssistantPreview,
  preview: AssistantCatalog["preview"],
) => {
  const assignment = fields(observation.result.assignment);
  const delivery =
    approved.input.action === "retry_notification" ? assignment.notification : assignment.delivery;
  if (
    (approved.name === "invite_reviewer" ||
      (approved.name === "manage_reviewer_assignment" &&
        (approved.input.action === "resend" || approved.input.action === "retry_notification"))) &&
    delivery === "failed"
  ) {
    // A failed delivery can still have committed the new assignment. Only the email is retried.
    const retry = await preview("manage_reviewer_assignment", {
      workspaceSlug: approved.input.workspaceSlug,
      applicationId: approved.input.applicationId,
      assignmentId: assignment.id,
      expectedRevision: assignment.revision,
      commandId: crypto.randomUUID(),
      note: "",
      action: approved.input.action === "retry_notification" ? "retry_notification" : "resend",
    });
    return {
      ...observation,
      result: { ...observation.result, status: "delivery_failed" },
      retry: retry.preview,
    };
  }
  return observation;
};

export const createAssistantCatalog = (
  actor: Actor,
  workspaceSlug: string,
  ops: AssistantOperations,
  origin: string,
): AssistantCatalog => {
  const ctx = { actor, workspaceSlug, ops };
  const definitions = scopedDefinitions(ctx, origin);

  const permits: AssistantCatalog["permits"] = (deps) => permitsAll(ctx, deps);

  const preview: AssistantCatalog["preview"] = async (name, input) => {
    const resolved = await resolveTool(ctx, definitions, name, input, true);
    if (!resolved.tool) {
      return receipt(resolved.error);
    }
    return prepareWrite(ctx, resolved.tool.name, resolved.input);
  };

  const execute = async (approved: AssistantPreview): ReturnType<AssistantCatalog["execute"]> => {
    const resolved = await resolveTool(ctx, definitions, approved.name, approved.input, true);
    if (!resolved.tool) {
      return receipt(resolved.error);
    }
    const current = await prepareWrite(ctx, resolved.tool.name, resolved.input, true);
    if (!("preview" in current)) {
      return {
        ...current,
        result: { status: current.result.status === "conflict" ? "stale" : current.result.status },
      };
    }
    if (!isDeepStrictEqual(approved, current.preview)) {
      return { ...receipt("stale"), dependencies: current.dependencies, retry: current.preview };
    }
    const result = await resolved.tool.execute(approved.input);
    const observation = describeResult(resolved.tool.name, approved.input, result);
    observation.dependencies.push(...current.dependencies);
    if (result.status === "conflict") {
      return { ...observation, result: { status: "stale" } };
    }

    return deliveryOutcome(observation, approved, preview);
  };

  return {
    list: async () => {
      const workspace = await ops.readWorkspace(actor, workspaceSlug);
      if (workspace?.slug !== workspaceSlug) {
        return [];
      }
      return definitions
        .filter((tool) => workspacePermits(workspace, assistantPolicy[tool.name].access))
        .map(providerDefinition);
    },
    permits,
    preview,
    execute,
    read: async (name, input): Promise<AssistantReceipt> => {
      const resolved = await resolveTool(ctx, definitions, name, input, false);
      if (!resolved.tool) {
        return receipt(resolved.error);
      }
      return describeResult(
        resolved.tool.name,
        { ...resolved.input, workspaceSlug },
        await resolved.tool.execute(resolved.input),
      );
    },
  };
};
