import { createServerFn } from "@tanstack/react-start";

import { withActor } from "@merit/auth/request";
import { applicationAuditInput, roundBudgetHistoryInput } from "@merit/grantmaking/api";

export const readApplicationHistory = createServerFn({ method: "GET" })
  .validator(applicationAuditInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.grantmaking.applicationAuditHistory(actor, data),
    ),
  );
export const readBudgetHistory = createServerFn({ method: "GET" })
  .validator(roundBudgetHistoryInput)
  .handler(({ context, data }) =>
    withActor(context.currentIdentity, (actor) =>
      context.grantmaking.roundBudgetHistory(actor, data),
    ),
  );
