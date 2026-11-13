import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

import { withActor } from "@merit/auth/request";
import { applicationAuditInput, roundBudgetHistoryInput } from "@merit/grantmaking/api";

export const readApplicationHistory = createServerFn({ method: "GET" })
  .validator(applicationAuditInput)
  .handler(({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.applicationAuditHistory(actor, data),
    );
  });
export const readBudgetHistory = createServerFn({ method: "GET" })
  .validator(roundBudgetHistoryInput)
  .handler(({ context, data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return withActor(context.currentIdentity, (actor) =>
      context.workspace.roundBudgetHistory(actor, data),
    );
  });
