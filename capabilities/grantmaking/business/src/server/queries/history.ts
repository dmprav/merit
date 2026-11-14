import type { z } from "zod";

import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import { applicationAuditInput, roundBudgetHistoryInput } from "../../api/queries/reading";
import {
  readApplicationContext,
  readGrantWorkspaceAccess,
  readRoundOverview,
} from "../persistence/queries/reading";
import { readApplicationHistory, readRoundHistory } from "./history-records";

export const applicationAuditHistory = (
  db: Database,
  actor: Actor,
  input: z.input<typeof applicationAuditInput>,
) =>
  readTransaction(db, async (tx) => {
    const parsed = applicationAuditInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const workspace = await readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!workspace?.allowed || !(await readApplicationContext(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    return {
      status: "ok",
      ...(await readApplicationHistory(
        tx,
        workspace.organizationId,
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
  readTransaction(db, async (tx) => {
    const parsed = roundBudgetHistoryInput.safeParse(input);
    if (!parsed.success) {
      return { status: "not_found" } as const;
    }
    const request = parsed.data;
    const workspace = await readGrantWorkspaceAccess(tx, actor.userId, request.workspaceSlug);
    if (!workspace?.allowed || !(await readRoundOverview(tx, actor.userId, request))) {
      return { status: "not_found" } as const;
    }
    return {
      status: "ok",
      ...(await readRoundHistory(tx, workspace.organizationId, request.roundId, request)),
    } as const;
  });
