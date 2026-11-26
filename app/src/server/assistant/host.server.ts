import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { createAssistantCatalog } from "@merit/mcp/assistant";
import { AssistantStoreError, createAssistantStore } from "@merit/organizations/server/assistant";
import { productLinks } from "@merit/product/links";
import { deliverCommittedReviewerMessage, type ReviewerDelivery } from "@merit/reviews/server";
import { reportError } from "@merit/telemetry/errors";
import type { OutcomeWait } from "@merit/workflows/outcome";

import { createApplicationServices } from "../services.server";
import type { AssistantWork } from "./conversation-work";
import { assistantJson, type AssistantCommand } from "./http.server";
import { createOpenAiAssistantModel } from "./openai.server";
import {
  AssistantTurnConflict,
  createAssistantTurns,
  type AssistantRuntimeCatalog,
} from "./turns.server";
import { watchAssistant } from "./watch.server";

/** What a turn needs to run, in the web server and in the worker that drives turns. */
export type AssistantRuntimeDependencies = Omit<
  Parameters<typeof createApplicationServices>[0],
  "identity"
> & {
  /** How long an approved invitation stays `delivering`: the workflow's retries plus a margin. */
  committedDeliveryWait?: OutcomeWait;
};

type Dependencies = AssistantRuntimeDependencies & {
  /**
   * Wakes a conversation's workflow after a request changed it, starting the workflow when it
   * has none. It never rejects and answers false only when Temporal could not be reached; the
   * committed change stands and reconciliation starts the work later.
   */
  wakeConversation: (work: AssistantWork) => Promise<boolean>;
};

const committedDeliveryWait: OutcomeWait = { timeoutMs: 16 * 60_000, intervalMs: 2000 };

type Config = { apiKey: string; model: string };

const catalogFor = (dependencies: AssistantRuntimeDependencies) => {
  const delivery = {
    database: dependencies.database,
    start: dependencies.startReviewerMessage,
  };

  return (actor: Actor, workspace: string, transaction?: Database): AssistantRuntimeCatalog => {
    let ticket: ReviewerDelivery | undefined;
    const services = createApplicationServices({
      ...dependencies,
      database: transaction ? (use) => use(transaction) : dependencies.database,
      deferReviewerDelivery: transaction
        ? (pending) => {
            ticket = pending;
          }
        : undefined,
      identity: {
        isOperator: async () => false,
        verifiedEmails: async () => [],
        displayName: async () => null,
      },
    });
    const tools = createAssistantCatalog(
      actor,
      workspace,
      {
        ...services,
        organizations: {
          ...services.organizations,
          workspaceHomeUrl: (slug) =>
            new URL(productLinks.workspaceHome(slug), dependencies.invitationOrigin).href,
        },
        readWorkspace: services.organizations.readWorkspace,
      },
      dependencies.invitationOrigin,
    );
    return {
      ...tools,
      async execute(preview) {
        ticket = undefined;
        const result = await tools.execute(preview);
        return ticket ? { ...result, delivery: ticket } : result;
      },
      deliver: (pending) =>
        deliverCommittedReviewerMessage(
          delivery,
          actor.userId,
          pending,
          dependencies.committedDeliveryWait ?? committedDeliveryWait,
        ),
    };
  };
};

type Backend = {
  store: ReturnType<typeof createAssistantStore>;
  turns: ReturnType<typeof createAssistantTurns>;
  wake: Dependencies["wakeConversation"];
  model: string;
  configured: boolean;
};

type Settings = Extract<AssistantCommand, { action: "settings" | "set_consent" }>;

type Work = Extract<AssistantCommand, { action: "start" | "approve" | "retry" }>;

const missing = () => assistantJson({ status: "not_found" }, 404);

const unavailable = () => assistantJson({ status: "provider_unconfigured" }, 503);

const show = (value: unknown) => (value == null ? missing() : assistantJson(value));

const settings = async (
  { configured, model, store }: Backend,
  actor: Actor,
  workspace: string,
  input: Settings,
) => {
  if (input.action === "set_consent" && input.enabled && !configured) {
    return unavailable();
  }
  const enabled =
    input.action === "settings"
      ? await store.getConsent(actor, workspace)
      : await store.setConsent(actor, workspace, input.enabled);
  return assistantJson({ provider: "OpenAI", model: model || null, configured, enabled });
};

const enqueue = async (
  { turns, wake, configured }: Backend,
  actor: Actor,
  workspace: string,
  input: Work,
) => {
  if (!configured) {
    return unavailable();
  }
  const snapshot =
    input.action === "start"
      ? await turns.start(actor, workspace, input.id, input)
      : input.action === "approve"
        ? await turns.approve(actor, workspace, input.id, input)
        : await turns.retry(actor, workspace, input.id, input);
  if (!snapshot) {
    return missing();
  }
  await wake({ userId: actor.userId, workspaceSlug: workspace, conversationId: input.id });
  return assistantJson(snapshot, 202);
};

const dispatch = async (
  backend: Backend,
  actor: Actor,
  workspace: string,
  input: AssistantCommand,
  signal: AbortSignal,
) => {
  const { turns } = backend;
  switch (input.action) {
    case "settings":
    case "set_consent":
      return settings(backend, actor, workspace, input);
    case "evidence":
      return show(await turns.evidence(actor, workspace, input.id, input.key));
    case "list":
      return assistantJson(await turns.list(actor, workspace));
    case "create":
      return backend.configured
        ? assistantJson(await turns.create(actor, workspace), 201)
        : unavailable();
    case "delete":
      return (await turns.remove(actor, workspace, input.id))
        ? assistantJson({ status: "deleted" })
        : missing();
    case "watch": {
      // Waking is idempotent: opening a stream on running work makes sure something drives it.
      let woken = false;
      return watchAssistant(async () => {
        const snapshot = await turns.open(actor, workspace, input.id);
        if (snapshot?.status === "running" && backend.configured && !woken) {
          woken = true;
          await backend.wake({
            userId: actor.userId,
            workspaceSlug: workspace,
            conversationId: input.id,
          });
        }
        return snapshot;
      }, signal);
    }
    case "open":
    case "stop":
      return show(await turns[input.action](actor, workspace, input.id));
    case "decline": {
      const snapshot = await turns.decline(actor, workspace, input.id, input);
      if (snapshot?.status === "running" && backend.configured) {
        await backend.wake({
          userId: actor.userId,
          workspaceSlug: workspace,
          conversationId: input.id,
        });
      }
      return show(snapshot);
    }
    default:
      return enqueue(backend, actor, workspace, input);
  }
};

/** The store and turns of Merit AI, built the same way for requests and for the turn worker. */
export const createAssistantRuntime = (
  dependencies: AssistantRuntimeDependencies,
  config: Config,
) => {
  const store = createAssistantStore(dependencies.database);
  const turns = createAssistantTurns({
    store,
    catalog: catalogFor(dependencies),
    model: createOpenAiAssistantModel(config),
  });
  return { store, turns, configured: Boolean(config.model && config.apiKey) };
};

export const createAssistantHost = (dependencies: Dependencies, config: Config) => {
  const { store, turns, configured } = createAssistantRuntime(dependencies, config);
  const backend = {
    configured,
    model: config.model,
    store,
    turns,
    wake: dependencies.wakeConversation,
  };
  return {
    command: async (
      actor: Actor,
      workspace: string,
      input: AssistantCommand,
      signal: AbortSignal,
    ) => {
      try {
        return await dispatch(backend, actor, workspace, input, signal);
      } catch (error) {
        if (error instanceof AssistantTurnConflict) {
          return assistantJson({ status: "conflict" }, 409);
        }
        if (error instanceof AssistantStoreError) {
          return assistantJson({ status: error.code }, 403);
        }
        reportError(new Error("Assistant request failed."), {
          surface: "server",
          operation: "assistant.command",
        });
        return assistantJson({ status: "unavailable" }, 503);
      }
    },
  };
};
