import { z } from "zod";

import { publicIdSchema } from "@merit/grantmaking/api";
import {
  createRoundRequestSchema,
  editRoundRequestSchema,
  deleteRoundRequestSchema,
} from "@merit/rounds/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { FundingRoundOperations } from "./operations";
import { roundCreatedSchema, roundSavedSchema } from "./responses";
import { write, revision } from "./tool-options";

export const registerPreparationTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: Pick<FundingRoundOperations, "createRound" | "editRound" | "deleteRound">,
) => {
  register(
    "create_funding_round",
    {
      ...write,
      annotations: { ...write.annotations, destructiveHint: false },
      description:
        "Create a round. Reuse requestId on retry. Budget is a decimal EUR string; blank means unknown.",
      inputSchema: createRoundRequestSchema,
      outputSchema: roundCreatedSchema,
    },
    async (input) => {
      const result = await workspace.createRound(actor, input);
      return result.status === "ok" ? { status: "ok" as const, roundId: result.publicId } : result;
    },
  );
  register(
    "edit_funding_round",
    {
      ...write,
      description:
        "Edit round preparation using the original preparationRevision. Preserve criterion IDs across edits and reordering; new criteria need new UUIDs. Send only changed details fields; omitted fields stay unchanged. Budget changes require a reason. Saves directly.",
      inputSchema: editRoundRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ roundId: publicIdSchema, expectedPreparationRevision: revision }),
      outputSchema: roundSavedSchema,
    },
    async ({ roundId, expectedPreparationRevision, ...input }) => {
      const result = await workspace.editRound(actor, {
        ...input,
        publicId: roundId,
        expectedRevision: expectedPreparationRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, roundId, preparationRevision: result.revision }
        : result;
    },
  );
  register(
    "delete_funding_round",
    {
      ...write,
      description:
        "Delete an eligible empty round when deletion is requested. History is retained. Requires the original preparationRevision.",
      inputSchema: deleteRoundRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ roundId: publicIdSchema, expectedPreparationRevision: revision }),
      outputSchema: z.object({
        status: z.literal("ok"),
        roundId: publicIdSchema,
        deleted: z.literal(true),
      }),
    },
    async ({ roundId, expectedPreparationRevision, ...input }) => {
      const result = await workspace.deleteRound(actor, {
        ...input,
        publicId: roundId,
        expectedRevision: expectedPreparationRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, roundId, deleted: true as const }
        : result;
    },
  );
};
