import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { Call, ScenarioContext } from "../scenario";

export const alder = { workspaceSlug: "alder" };

export const createRound = async (
  call: Call,
  title: string,
  budget?: string,
  budgetReason?: string,
) => {
  const created = await call("create_funding_round", {
    ...alder,
    requestId: randomUUID(),
    title,
    budget,
    budgetReason,
  });
  return z.object({ status: z.literal("ok"), roundId: z.string() }).parse(created).roundId;
};

export const addMember = async (
  ctx: ScenarioContext,
  id: string,
  name: string,
  role: "program_manager" | "reviewer",
) => {
  await ctx.sql.query("INSERT INTO app_users (id, name, clerk_user_id) VALUES ($1, $2, $3)", [
    id,
    name,
    `eval-${id}`,
  ]);
  await ctx.sql.query(
    "INSERT INTO memberships (organization_id, user_id, email, role) VALUES ('alder', $1, $2, $3)",
    [id, `${id}@example.test`, role],
  );
};

export const listRoundRows = async (ctx: ScenarioContext) =>
  (
    await ctx.sql.query<{
      id: string;
      title: string;
      budget: string | null;
      manager: string;
      revision: number;
    }>(
      "SELECT id, title, budget_minor_units::text AS budget, manager_user_id AS manager, revision FROM funding_rounds WHERE organization_id='alder' ORDER BY id",
    )
  ).rows;
