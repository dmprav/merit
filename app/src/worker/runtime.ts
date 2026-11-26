import { env as processEnvironment } from "node:process";

import { createServerAnalytics } from "@merit/analytics/server";
import { createDatabasePool } from "@merit/db";
import { createWorkflowClient, readTemporalConfig, type TemporalConfig } from "@merit/workflows";

import { createAssistantRuntime } from "../server/assistant/host.server";
import { createBackgroundWork } from "../server/background-work.server";
import { createEmailSender } from "../server/email-delivery.server";
import { readAppOrigin, readDatabaseUrl } from "../server/runtime-config.server";
import { organizationInvitationDelivery, reviewerMessageDelivery } from "../server/services.server";
import { createActivities } from "./activities";
import { createAssistantActivities } from "./assistant-activities";
import { assistantTurnConcurrency, readWorkSettings } from "./task-queue";

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Everything the worker's activities need, read from the environment the way the web server
 * reads it. `local` is true only for development and preview.
 */
export const createWorkerRuntime = (
  env: Environment = processEnvironment,
  local = env.MERIT_LOCAL_WORKER === "1",
) => {
  const config: TemporalConfig = readTemporalConfig(env, { local });
  const database = createDatabasePool(readDatabaseUrl());
  const client = createWorkflowClient(config);
  const sendEmail = createEmailSender({
    from: env.EMAIL_FROM ?? (local ? "invitations@merit.local" : ""),
    resendKey: env.RESEND_API_KEY ?? "",
    mailpitUrl: local ? (env.MAILPIT_URL ?? "http://127.0.0.1:8025") : undefined,
  });
  const queues = readWorkSettings(env);
  const background = createBackgroundWork({
    client: () => client,
    taskQueue: queues.taskQueue,
    turnTaskQueue: queues.turnTaskQueue,
  });

  const invitationKey = () => config.payloadKey;

  const invitationOrigin = readAppOrigin();
  // Turns run here, so this process owns what a turn's grant changes report and deliver.
  const assistant = createAssistantRuntime(
    {
      database,
      analytics: createServerAnalytics({
        apiKey: env.VITE_POSTHOG_KEY,
        host: env.VITE_POSTHOG_HOST,
      }),
      startReviewerMessage: background.startReviewerMessage,
      invitationKey,
      startOrganizationInvitation: background.startOrganizationInvitation,
      invitationOrigin,
    },
    { apiKey: env.OPENAI_API_KEY ?? "", model: env.MERIT_AI_MODEL ?? "" },
  );
  const activities = createActivities({
    database,
    assistant: {
      configured: assistant.configured,
      running: assistant.store.running,
      wake: background.wakeAssistantConversation,
    },
    reviewerMessages: reviewerMessageDelivery({
      database,
      invitationOrigin: readAppOrigin(),
      sendEmail,
    }),
    invitations: organizationInvitationDelivery({
      database,
      invitationOrigin: readAppOrigin(),
      sendEmail,
    }),
    invitationDispatch: { invitationKey, start: background.startOrganizationInvitation },
    reconcileReviewerMessage: background.reconcileReviewerMessage,
  });
  const activityQueues = [
    {
      taskQueue: queues.turnTaskQueue,
      activities: createAssistantActivities(assistant),
      maxConcurrentActivities: assistantTurnConcurrency,
    },
  ];
  return { config, client, activities, activityQueues, queues };
};
