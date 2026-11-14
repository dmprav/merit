import { z } from "zod";

import {
  createApplicationRequestSchema,
  editApplicationRequestSchema,
  selectContactRequestSchema,
} from "@merit/applications/api";
import { intakeChanges } from "@merit/applications/domain";
import { applicationReadInput, publicIdSchema } from "@merit/grantmaking/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { FundingRoundOperations } from "./operations";
import { applicationCreatedSchema, applicationSavedSchema } from "./responses";
import { write, revision } from "./tool-options";

const lifecycle = [
  [
    "start_application_revision",
    "Start a correction or revision of application intake.",
    intakeChanges.startRevision,
  ],
  [
    "save_application_revision",
    "Save the requested working revision. Retain the original intakeRevision and explanation. Preserve questionId for existing sections; assign new UUIDs only to new sections.",
    intakeChanges.saveRevision,
  ],
  [
    "publish_application_revision",
    "Publish the working intake revision, preserving the previous evidence. This is not a funding decision or public release.",
    intakeChanges.publishRevision,
  ],
  [
    "discard_application_revision",
    "Discard the working revision only when requested. Published intake remains unchanged.",
    intakeChanges.discardRevision,
  ],
  [
    "mark_application_ready",
    "Mark complete application intake ready for review.",
    intakeChanges.markReady,
  ],
  [
    "withdraw_application",
    "Record that the applicant withdrew the application, with the withdrawal date (a calendar date that is not in the future anywhere) and a reason. Withdrawal is the applicant stepping back; it is not a rejection or a deletion. The application, its material, reviews, and recommendation are kept, but it stops counting as active work or funding demand, becomes read-only, and every outstanding review request closes and ends reviewer access. The application can be reinstated.",
    intakeChanges.withdraw,
  ],
  [
    "reinstate_application",
    "Reinstate a withdrawn application with a reason, returning it to its earlier intake status and working revision. Review requests closed by the withdrawal stay closed; create new requests or reinstate reviewer assignments.",
    intakeChanges.reinstate,
  ],
  [
    "delete_application",
    "Delete an eligible unused application only when deletion is requested. Intake history is retained.",
    intakeChanges.delete,
  ],
] as const;

const intakeBase = applicationReadInput.extend({ expectedIntakeRevision: revision });

export const registerIntakeTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: Pick<
    FundingRoundOperations,
    "createApplication" | "editApplication" | "selectContact"
  >,
) => {
  register(
    "create_application",
    {
      ...write,
      annotations: { ...write.annotations, destructiveHint: false },
      description:
        "Create partial application intake in roundId. Reuse requestId on retry. Requested amount is a decimal EUR string; blank means unknown. Assign each initial answer a questionId UUID and reuse it on retry.",
      inputSchema: createApplicationRequestSchema
        .omit({ publicId: true })
        .extend({ roundId: publicIdSchema }),
      outputSchema: applicationCreatedSchema,
    },
    async ({ roundId, ...input }) => {
      const result = await workspace.createApplication(actor, { ...input, publicId: roundId });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId: result.publicId }
        : result;
    },
  );
  register(
    "edit_application",
    {
      ...write,
      description:
        "Save changed intake fields or staff summary with the original intakeRevision. Omitted content fields stay unchanged. Preserve questionId across edits and reordering; new sections need new UUIDs. Create shared contacts with contact tools and select their contactId. Suggestions remain unsaved until saving is requested.",
      inputSchema: intakeBase.extend({
        change: z.discriminatedUnion("action", [intakeChanges.saveContent, intakeChanges.details]),
      }),
      outputSchema: applicationSavedSchema,
    },
    async ({ applicationId, expectedIntakeRevision, ...input }) => {
      const result = await workspace.editApplication(actor, {
        ...input,
        publicId: applicationId,
        expectedRevision: expectedIntakeRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId, intakeRevision: result.revision }
        : result;
    },
  );
  registerIntakeLifecycleTools(register, actor, workspace);
  register(
    "select_application_contact",
    {
      ...write,
      description:
        "Associate or clear the shared applicant contact using the original intakeRevision. Contact details remain owned by the contact.",
      inputSchema: selectContactRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ applicationId: publicIdSchema, expectedIntakeRevision: revision }),
      outputSchema: applicationSavedSchema,
    },
    async ({ applicationId, expectedIntakeRevision, ...input }) => {
      const result = await workspace.selectContact(actor, {
        ...input,
        publicId: applicationId,
        expectedRevision: expectedIntakeRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId, intakeRevision: result.revision }
        : result;
    },
  );
};

const registerIntakeLifecycleTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: Pick<FundingRoundOperations, "editApplication">,
) => {
  for (const [name, description, change] of lifecycle) {
    const { action, ...fieldsSchema } = change.shape;
    register(
      name,
      {
        ...write,
        description,
        inputSchema: intakeBase.extend(fieldsSchema),
        outputSchema: applicationSavedSchema,
      },
      async ({ applicationId, expectedIntakeRevision, workspaceSlug, ...fields }) => {
        const command = editApplicationRequestSchema.parse({
          workspaceSlug,
          publicId: applicationId,
          expectedRevision: expectedIntakeRevision,
          change: { ...fields, action: action.value },
        });
        const result = await workspace.editApplication(actor, command);
        return result.status === "ok"
          ? { status: "ok" as const, applicationId, intakeRevision: result.revision }
          : result;
      },
    );
  }
};
