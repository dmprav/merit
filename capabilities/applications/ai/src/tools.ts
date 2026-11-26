import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import { writeErrorSchema, revision } from "@merit/ai/contracts";
import {
  createApplicationRequestSchema,
  editApplicationRequestSchema,
  selectContactRequestSchema,
  type ApplicationsService,
} from "@merit/applications/api";
import { intakeChanges } from "@merit/applications/domain";
import type { Actor } from "@merit/auth";
import { publicIdSchema } from "@merit/db/identifiers";

import { applicationCreatedSchema, applicationSavedSchema } from "./responses";

const lifecycle = [
  [
    "start_application_revision",
    "Start a correction or revision of application intake.",
    intakeChanges.startRevision,
  ],
  [
    "save_application_revision",
    "Save edits to the open correction or revision as a draft. The existing recorded material stays current. A request to save the draft is complete after this call. Use the intakeRevision the edits were based on. Include the user's reason for the change and retain the existing explanation if none is supplied. Preserve questionId for existing sections and assign new UUIDs only to new sections.",
    intakeChanges.saveRevision,
    "draft_saved",
  ],
  [
    "publish_application_revision",
    "Replace the current recorded material with the saved draft. Use this to make a correction or revision current when requested. Keeping the recorded version current means keeping the existing material in place: stop after saving the draft. If the intended version is unclear, ask before replacing it. Earlier versions remain available as evidence. Publication is internal to application intake.",
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
    "Record that the applicant withdrew the application, with the withdrawal date (a calendar date that is not in the future anywhere) and a reason. Withdrawal is the applicant stepping back; it is not a rejection or a deletion. The application, its material, reviews, recommendation, and committee decision are kept, but it stops counting as active work or funding demand, becomes read-only, and every outstanding review request closes and ends reviewer access. An application whose committee decision commits funding cannot be withdrawn and is rejected with application_has_commitment; first supersede the decision with a new decision version that commits no funding. The application can be reinstated.",
    intakeChanges.withdraw,
  ],
  [
    "reinstate_application",
    "Reinstate a withdrawn application with a reason, returning it to its earlier intake status and working revision. Review requests closed by the withdrawal stay closed; create new requests or reinstate reviewer assignments.",
    intakeChanges.reinstate,
  ],
  [
    "delete_application",
    "Delete an eligible unused application only when deletion is requested. An application with any committee decision cannot be deleted. Intake history is retained.",
    intakeChanges.delete,
  ],
] as const;

const applicationReadInput = createApplicationRequestSchema
  .pick({ workspaceSlug: true })
  .extend({ applicationId: publicIdSchema });

const intakeBase = applicationReadInput.extend({ expectedIntakeRevision: revision });

export const createApplicationTools = (actor: Actor, applications: ApplicationsService) => [
  defineActorTool(
    actor,
    "create_application",
    {
      errorSchema: writeErrorSchema,
      description:
        "Create partial application intake in roundId. Reuse requestId on retry. Requested amount is a decimal EUR string; blank means unknown. Assign each initial answer a questionId UUID and reuse it on retry.",
      inputSchema: createApplicationRequestSchema
        .omit({ publicId: true })
        .extend({ roundId: publicIdSchema }),
      outputSchema: applicationCreatedSchema,
    },
    async ({ roundId, ...input }) => {
      const result = await applications.createApplication(actor, { ...input, publicId: roundId });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId: result.publicId }
        : result;
    },
  ),
  defineActorTool(
    actor,
    "edit_application",
    {
      errorSchema: writeErrorSchema,
      description:
        "Save application intake edits when requested. Leave suggested edits unsaved. The details action replaces the shared staff summary. Use it only when the user asks to edit that summary. A pending review belongs in request_review and requires a named reviewer. If the reviewer is undecided, ask who should review the application and stop before writing. Supply expectedIntakeRevision for intake content. Omitted content fields stay unchanged. Preserve questionId across edits and reordering; new sections need new UUIDs. Create shared contacts with contact tools and select their contactId.",
      inputSchema: applicationReadInput.extend({
        expectedIntakeRevision: revision.optional(),
        change: z.discriminatedUnion("action", [
          intakeChanges.saveContent,
          intakeChanges.details.extend({
            summary: intakeChanges.details.shape.summary.describe(
              "Replacement text for an explicitly requested staff summary edit. Review tracking belongs to review requests.",
            ),
          }),
        ]),
      }),
      outputSchema: applicationSavedSchema,
    },
    async ({ applicationId, expectedIntakeRevision, ...input }) => {
      const result = await applications.editApplication(actor, {
        ...input,
        publicId: applicationId,
        expectedRevision: expectedIntakeRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId, intakeRevision: result.revision }
        : result;
    },
  ),
  ...createIntakeLifecycleTools(actor, applications),
  defineActorTool(
    actor,
    "select_application_contact",
    {
      errorSchema: writeErrorSchema,
      description:
        "Set or clear the shared applicant contact on one application. Contact details remain owned by the contact. If the user also asks which applications the person is linked to, call list_contact_applications with their contactId after saving the link.",
      inputSchema: selectContactRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ applicationId: publicIdSchema, expectedIntakeRevision: revision.optional() }),
      outputSchema: applicationSavedSchema,
    },
    async ({ applicationId, expectedIntakeRevision, ...input }) => {
      const result = await applications.selectContact(actor, {
        ...input,
        publicId: applicationId,
        expectedRevision: expectedIntakeRevision,
      });
      return result.status === "ok"
        ? { status: "ok" as const, applicationId, intakeRevision: result.revision }
        : result;
    },
  ),
];

const createIntakeLifecycleTools = (
  actor: Actor,
  applications: Pick<ApplicationsService, "editApplication">,
) => {
  return lifecycle.map(([name, description, change, materialEffect]) => {
    const { action, ...fieldsSchema } = change.shape;
    return defineActorTool(
      actor,
      name,
      {
        errorSchema: writeErrorSchema,
        description,
        inputSchema: intakeBase.extend(fieldsSchema),
        outputSchema: materialEffect
          ? applicationSavedSchema.extend({ materialEffect: z.literal(materialEffect) })
          : applicationSavedSchema,
      },
      async ({ applicationId, expectedIntakeRevision, workspaceSlug, ...fields }) => {
        const command = editApplicationRequestSchema.parse({
          workspaceSlug,
          publicId: applicationId,
          expectedRevision: expectedIntakeRevision,
          change: { ...fields, action: action.value },
        });
        const result = await applications.editApplication(actor, command);
        return result.status === "ok"
          ? {
              status: "ok" as const,
              applicationId,
              intakeRevision: result.revision,
              ...(materialEffect && { materialEffect }),
            }
          : result;
      },
    );
  });
};
