import { z } from "zod";

import {
  attachApplicationDocumentInputSchema,
  citeApplicationDocumentInputSchema,
  createApplicationRequestSchema,
  editApplicationRequestSchema,
  listApplicationDocumentsInputSchema,
  readApplicationDocumentFileInputSchema,
  selectContactRequestSchema,
  type ApplicationsService,
} from "@merit/applications/api";
import { intakeChanges } from "@merit/applications/domain";
import { publicIdSchema } from "@merit/db/identifiers";
import { applicationReadInput } from "@merit/grantmaking/api";

import type { RegisterTool } from "../../components/register-tool";
import { grantWriteOptions, readAnnotations, revision } from "../../components/tool-options";
import type { McpActor } from "../../contracts";
import {
  applicationCreatedSchema,
  applicationDocumentFileSchema,
  applicationDocumentsResultSchema,
  applicationSavedSchema,
  attachedDocumentSchema,
  citedDocumentSchema,
  documentReadErrorSchema,
} from "./responses";

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

export const registerApplicationTools = (
  register: RegisterTool,
  actor: McpActor,
  applications: ApplicationsService,
) => {
  register(
    "create_application",
    {
      ...grantWriteOptions,
      annotations: { ...grantWriteOptions.annotations, destructiveHint: false },
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
  );
  register(
    "edit_application",
    {
      ...grantWriteOptions,
      description:
        "Save changed intake fields or staff summary with the original intakeRevision. Omitted content fields stay unchanged. Preserve questionId across edits and reordering; new sections need new UUIDs. Create shared contacts with contact tools and select their contactId. Suggestions remain unsaved until saving is requested.",
      inputSchema: intakeBase.extend({
        change: z.discriminatedUnion("action", [intakeChanges.saveContent, intakeChanges.details]),
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
  );
  registerIntakeLifecycleTools(register, actor, applications);
  registerApplicationDocumentTools(register, actor, applications);
  register(
    "select_application_contact",
    {
      ...grantWriteOptions,
      description:
        "Associate or clear the shared applicant contact using the original intakeRevision. Contact details remain owned by the contact.",
      inputSchema: selectContactRequestSchema
        .omit({ publicId: true, expectedRevision: true })
        .extend({ applicationId: publicIdSchema, expectedIntakeRevision: revision }),
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
  );
};

const registerApplicationDocumentTools = (
  register: RegisterTool,
  actor: McpActor,
  applications: ApplicationsService,
) => {
  registerApplicationDocumentReads(register, actor, applications);
  registerApplicationDocumentWrites(register, actor, applications);
};

const registerApplicationDocumentReads = (
  register: RegisterTool,
  actor: McpActor,
  applications: ApplicationsService,
) => {
  const documentRead = {
    scope: "workspace:read" as const,
    annotations: readAnnotations,
    errorSchema: documentReadErrorSchema,
  };
  register(
    "list_application_documents",
    {
      ...documentRead,
      description:
        "Read proposal and budget PDF versions and page references for an application, newest first, without the file bytes. An empty slot has no version. Withdrawn applications remain readable.",
      inputSchema: listApplicationDocumentsInputSchema
        .omit({ publicId: true })
        .extend({ applicationId: listApplicationDocumentsInputSchema.shape.publicId }),
      outputSchema: applicationDocumentsResultSchema,
    },
    async ({ applicationId, ...input }) =>
      applications.listApplicationDocuments(actor, { ...input, publicId: applicationId }),
  );
  register(
    "read_application_document_file",
    {
      ...documentRead,
      description:
        "Read one proposal or budget version as base64. Program managers use this tool. Reviewers use the assignment file tool.",
      inputSchema: readApplicationDocumentFileInputSchema
        .omit({ publicId: true })
        .extend({ applicationId: readApplicationDocumentFileInputSchema.shape.publicId }),
      outputSchema: applicationDocumentFileSchema,
    },
    async ({ applicationId, ...input }) =>
      applications.readApplicationDocumentFile(actor, { ...input, publicId: applicationId }),
  );
};

const registerApplicationDocumentWrites = (
  register: RegisterTool,
  actor: McpActor,
  applications: ApplicationsService,
) => {
  const documentWrite = {
    scope: grantWriteOptions.scope,
    errorSchema: grantWriteOptions.errorSchema,
    annotations: {
      ...grantWriteOptions.annotations,
      idempotentHint: false,
      destructiveHint: false,
    },
  };
  register(
    "attach_application_document",
    {
      ...documentWrite,
      description:
        "Attach a proposal or budget PDF. expectedVersion is 0 when the slot is empty, otherwise the current version last read. A mismatch writes nothing. The same bytes still create a new version. This does not change intake revision or review freshness. Send the file as base64.",
      inputSchema: attachApplicationDocumentInputSchema
        .omit({ publicId: true })
        .extend({ applicationId: attachApplicationDocumentInputSchema.shape.publicId }),
      outputSchema: attachedDocumentSchema,
    },
    async ({ applicationId, ...input }) => {
      const result = await applications.attachApplicationDocument(actor, {
        ...input,
        publicId: applicationId,
      });
      return result.status === "ok" ? { status: "ok" as const, version: result.version } : result;
    },
  );
  register(
    "cite_application_document_page",
    {
      ...documentWrite,
      description:
        "Record a reference to one page of an existing proposal or budget version. The note is optional. Citations stay when a newer version is attached and do not use expectedVersion.",
      inputSchema: citeApplicationDocumentInputSchema
        .omit({ publicId: true })
        .extend({ applicationId: citeApplicationDocumentInputSchema.shape.publicId }),
      outputSchema: citedDocumentSchema,
    },
    async ({ applicationId, ...input }) => {
      const result = await applications.citeApplicationDocumentPage(actor, {
        ...input,
        publicId: applicationId,
      });
      return result.status === "ok"
        ? { status: "ok" as const, citationId: result.citationId }
        : result;
    },
  );
};

const registerIntakeLifecycleTools = (
  register: RegisterTool,
  actor: McpActor,
  applications: Pick<ApplicationsService, "editApplication">,
) => {
  for (const [name, description, change] of lifecycle) {
    const { action, ...fieldsSchema } = change.shape;
    register(
      name,
      {
        ...grantWriteOptions,
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
        const result = await applications.editApplication(actor, command);
        return result.status === "ok"
          ? { status: "ok" as const, applicationId, intakeRevision: result.revision }
          : result;
      },
    );
  }
};
