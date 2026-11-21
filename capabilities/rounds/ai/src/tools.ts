import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import { writeErrorSchema, revision } from "@merit/ai/contracts";
import type { Actor } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";
import {
  createRoundRequestSchema,
  deleteRoundRequestSchema,
  editRoundInputSchema,
  type RoundsService,
} from "@merit/rounds/api";

import { roundCreatedSchema, roundSavedSchema } from "./responses";

export const createRoundTools = (actor: Actor, rounds: RoundsService) => [
  defineActorTool(
    actor,
    "create_funding_round",
    {
      errorSchema: writeErrorSchema,
      description:
        "Create a round. Reuse requestId on retry. Budget is a decimal EUR string; blank means unknown.",
      inputSchema: createRoundRequestSchema,
      outputSchema: roundCreatedSchema,
    },
    async (input) => {
      const result = await rounds.createRound(actor, input);
      return result.status === "ok" ? { status: "ok" as const, roundId: result.publicId } : result;
    },
  ),
  defineActorTool(
    actor,
    "edit_funding_round",
    {
      errorSchema: writeErrorSchema,
      description:
        "Edit round preparation. Supply expectedPreparationRevision for purpose, criteria, and budget; title, meetingDate, and manager apply directly. Preserve criterion IDs across edits and reordering; new criteria need new UUIDs. Send only changed details fields; omitted fields stay unchanged. Budget changes require a reason. Saves directly.",
      inputSchema: editRoundInputSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ roundId: publicIdSchema, expectedPreparationRevision: revision.optional() }),
      outputSchema: roundSavedSchema,
    },
    async ({ roundId, expectedPreparationRevision, ...input }) => {
      const result = await rounds.editRound(actor, {
        ...input,
        publicId: roundId,
        expectedRevision: expectedPreparationRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, roundId, preparationRevision: result.revision }
        : result;
    },
  ),
  defineActorTool(
    actor,
    "delete_funding_round",
    {
      errorSchema: writeErrorSchema,
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
      const result = await rounds.deleteRound(actor, {
        ...input,
        publicId: roundId,
        expectedRevision: expectedPreparationRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, roundId, deleted: true as const }
        : result;
    },
  ),
];
