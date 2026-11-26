import { env as processEnvironment } from "node:process";

import { createDatabasePool } from "@merit/db";
import { createWorkflowClient, readTemporalConfig, type TemporalConfig } from "@merit/workflows";

import { createBackgroundWork } from "../server/background-work.server";
import { createEmailSender } from "../server/email-delivery.server";
import { readAppOrigin, readDatabaseUrl } from "../server/runtime-config.server";
import { reviewerMessageDelivery } from "../server/services.server";
import { createActivities } from "./activities";

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
  const background = createBackgroundWork({ client: () => client });
  const activities = createActivities({
    database,
    reviewerMessages: reviewerMessageDelivery({
      database,
      invitationOrigin: readAppOrigin(),
      sendEmail,
    }),
    reconcileReviewerMessage: background.reconcileReviewerMessage,
  });
  return { config, client, activities };
};
