import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { createAssistantCatalog } from "@merit/mcp/assistant";
import { AssistantStoreError, createAssistantStore } from "@merit/organizations/server/assistant";
import { productLinks } from "@merit/product/links";
import { deliverCommittedReviewerMessage, type ReviewerDelivery } from "@merit/reviews/server";
import { reportError } from "@merit/telemetry/errors";
import type { OutcomeWait } from "@merit/workflows/outcome";

import { createApplicationServices } from "../services.server";
import { assistantJson, type AssistantCommand } from "./http.server";
import { createOpenAiAssistantModel } from "./openai.server";
import { createAssistantWorker } from "./scheduler.server";
import {
  AssistantTurnConflict,
  createAssistantTurns,
  type AssistantRuntimeCatalog,
} from "./turns.server";
import { watchAssistant } from "./watch.server";

type Dependencies = Omit<Parameters<typeof createApplicationServices>[0], "identity"> & {
  /** How long an approved invitation stays `delivering`: the workflow's retries plus a margin. */
  committedDeliveryWait?: OutcomeWait;
};

const committedDeliveryWait: OutcomeWait = { timeoutMs: 16 * 60_000, intervalMs: 2000 };

type Config = { apiKey: string; model: string };

const catalogFor = (dependencies: Dependencies) => {
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
  worker: ReturnType<typeof createAssistantWorker>;
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
  { turns, worker, configured }: Backend,
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
  worker.schedule({ userId: actor.userId, workspaceSlug: workspace, id: input.id });
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
    case "watch":
      return watchAssistant(() => turns.open(actor, workspace, input.id), signal);
    case "open":
    case "stop":
      return show(await turns[input.action](actor, workspace, input.id));
    case "decline": {
      const snapshot = await turns.decline(actor, workspace, input.id, input);
      if (snapshot?.status === "running" && backend.configured) {
        backend.worker.schedule({ userId: actor.userId, workspaceSlug: workspace, id: input.id });
      }
      return show(snapshot);
    }
    default:
      return enqueue(backend, actor, workspace, input);
  }
};

export const createAssistantHost = (dependencies: Dependencies, config: Config) => {
  const configured = Boolean(config.model && config.apiKey);
  const store = createAssistantStore(dependencies.database);
  const turns = createAssistantTurns({
    store,
    catalog: catalogFor(dependencies),
    model: createOpenAiAssistantModel(config),
  });
  const worker = createAssistantWorker(store.running, turns.run);
  const backend = { configured, model: config.model, store, turns, worker };
  return {
    start: () => {
      if (configured) {
        worker.start();
      }
    },
    close: () => worker.close(),
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
