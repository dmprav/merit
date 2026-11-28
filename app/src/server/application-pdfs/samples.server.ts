import { Buffer } from "node:buffer";

import { z } from "zod";

import budget from "./samples/budget.pdf?inline";
import proposal from "./samples/proposal.pdf?inline";
import revisedBudget from "./samples/revised-budget.pdf?inline";

const samples = {
  proposal: { filename: "Workshop Saturdays proposal.pdf", data: proposal },
  budget: { filename: "Workshop Saturdays budget.pdf", data: budget },
  "revised-budget": { filename: "Workshop Saturdays revised budget.pdf", data: revisedBudget },
} as const;

const sampleKey = z.enum(["proposal", "budget", "revised-budget"]);

export const readDemoPdf = (name: string | null) => {
  const key = sampleKey.safeParse(name);
  if (!key.success) {
    return null;
  }
  const { filename, data } = samples[key.data];
  return { filename, bytes: Buffer.from(data.slice(data.indexOf(",") + 1), "base64") };
};
