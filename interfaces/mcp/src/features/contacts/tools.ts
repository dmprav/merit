import { z } from "zod";

import {
  contactCommandSchema,
  contactCommands,
  contactListInput,
  contactReadInput,
  contactHistoryInput,
} from "@merit/contacts/api";
import {
  contactApplicationListInput,
  applicationSummarySchema,
  publicIdSchema,
} from "@merit/grantmaking/api";

import type { RegisterTool } from "../../components/register-tool";
import type { McpActor } from "../../contracts";
import type { ContactOperations } from "./operations";
import {
  contactSchema,
  contactHistorySchema,
  contactReadErrorSchema,
  contactWriteErrorSchema,
} from "./responses";

export const registerContactTools = (
  register: RegisterTool,
  actor: McpActor,
  workspace: ContactOperations,
) => {
  const read = {
    scope: "workspace:read" as const,
    errorSchema: contactReadErrorSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  };
  register(
    "list_contacts",
    {
      ...read,
      description:
        "List bounded shared contact summaries in stable contactId order. Follow nextCursor. Filter archived explicitly or omit the filter for all contacts. History is fetched separately.",
      inputSchema: contactListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        contacts: z.array(contactSchema),
        nextCursor: z.uuid().nullable(),
      }),
    },
    (input) => workspace.listContacts(actor, input),
  );
  register(
    "list_contact_applications",
    {
      ...read,
      description:
        "List applications where this contact is an applicant or a recorded reviewer, including historical review associations, in stable applicationId order. Follow nextCursor. The application contactId identifies its current applicant contact; inspect reviews for reviewer associations.",
      inputSchema: contactApplicationListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        applications: z.array(applicationSummarySchema),
        nextCursor: publicIdSchema.nullable(),
      }),
    },
    (input) => workspace.listContactApplications(actor, input),
  );
  const resultSchema = z.object({ status: z.literal("ok"), contact: contactSchema });
  register(
    "get_contact",
    {
      ...read,
      description:
        "Read current shared contact details and contactRevision before editing or changing archive status.",
      inputSchema: contactReadInput,
      outputSchema: resultSchema,
    },
    (input) => workspace.getContact(actor, input),
  );
  register(
    "list_contact_history",
    {
      ...read,
      description:
        "Read contact changes and provenance in ascending revision order. Follow nextRevision as afterRevision.",
      inputSchema: contactHistoryInput,
      outputSchema: contactHistorySchema,
    },
    (input) => workspace.contactHistory(actor, input),
  );
  registerContactWrites(register, actor, workspace);
};

const registerContactWrites = (
  register: RegisterTool,
  actor: McpActor,
  workspace: ContactOperations,
) => {
  const resultSchema = z.object({ status: z.literal("ok"), contact: contactSchema });
  for (const [name, description, command] of [
    [
      "create_contact",
      "Create a shared contact. Supply a new contactId UUID and reuse it on retry.",
      contactCommands.create,
    ],
    [
      "update_contact",
      "Update requested shared contact details using expectedContactRevision. Current application views resolve the updated profile; their revisions and historical evidence remain unchanged.",
      contactCommands.update,
    ],
    [
      "archive_contact",
      "Archive a contact using expectedContactRevision. Outstanding review requests prevent archiving. Preserves current contact details.",
      contactCommands.archive,
    ],
    [
      "restore_contact",
      "Restore an archived contact using expectedContactRevision, preserving its details and history.",
      contactCommands.restore,
    ],
  ] as const) {
    const { action, ...fieldsSchema } = command.shape;
    register(
      name,
      {
        description,
        inputSchema: z.strictObject(fieldsSchema),
        outputSchema: resultSchema,
        errorSchema: contactWriteErrorSchema,
        scope: "grants:write",
        annotations: {
          readOnlyHint: false,
          destructiveHint: name !== "create_contact",
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input) => {
        const result = await workspace.changeContact(
          actor,
          contactCommandSchema.parse({ ...input, action: action.value }),
        );
        if (result.status === "ok") {
          const { id, revision, name, email, affiliation, archived } = result.contact;
          return {
            status: "ok" as const,
            contact: {
              contactId: id,
              contactRevision: revision,
              name,
              email,
              affiliation,
              archived,
            },
          };
        }
        return result.status === "invalid" && result.error === "outstanding_requests"
          ? {
              ...result,
              outstanding: result.outstanding.map(({ publicId, title }) => ({
                applicationId: publicId,
                title,
              })),
            }
          : result;
      },
    );
  }
};
