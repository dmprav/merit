import type { z } from "zod";

import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import { readWorkspace } from "@merit/organizations/transactions";
import { readRoundBudgetHistory } from "@merit/rounds/readers";

import { applicationAuditInput, roundBudgetHistoryInput } from "../../api/queries/reading";
import { readApplicationIdentity, readRoundIdentity } from "../persistence/queries/reading";
import { readApplicationHistory } from "./history-records";

export const applicationAuditHistory = (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationAuditInput>,
) =>
  readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = applicationAuditInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const application = await readApplicationIdentity(tx, actor.userId, request);
    if (!application) {
      return { status: "not_found" } as const;
    }
    return {
      status: "ok",
      ...(await readApplicationHistory(
        tx,
        application.organizationId,
        request.applicationId,
        request,
      )),
    } as const;
  });

export const roundBudgetHistory = (
  db: Database,
  actor: Actor,
  input: z.input<typeof roundBudgetHistoryInput>,
) =>
  readWorkspace(db, actor.userId, input?.workspaceSlug, async (tx) => {
    const parsed = roundBudgetHistoryInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const round = await readRoundIdentity(tx, actor.userId, request);
    if (!round) {
      return { status: "not_found" } as const;
    }
    return {
      status: "ok",
      ...(await readRoundBudgetHistory(tx, round.organizationId, request.roundId, request)),
    } as const;
  });
