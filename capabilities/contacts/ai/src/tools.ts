import { z } from "zod";

import { defineActorTool } from "@merit/ai";
import type { Actor } from "@merit/auth";
import {
  contactCommandSchema,
  contactCommands,
  contactListInput,
  contactReadInput,
} from "@merit/contacts/api";

import type { ContactOperations } from "./operations";
import { contactSchema, contactReadErrorSchema, contactWriteErrorSchema } from "./responses";

const resultSchema = z.object({ status: z.literal("ok"), contact: contactSchema });

export const createContactTools = (actor: Actor, contacts: ContactOperations) => [
  defineActorTool(
    actor,
    "list_contacts",
    {
      errorSchema: contactReadErrorSchema,
      description:
        "List bounded shared contact summaries in stable contactId order. Follow nextCursor. Filter archived explicitly or omit the filter for all contacts.",
      inputSchema: contactListInput,
      outputSchema: z.object({
        status: z.literal("ok"),
        contacts: z.array(contactSchema),
        nextCursor: z.uuid().nullable(),
      }),
    },
    (input) => contacts.listContactSummaries(actor, input),
  ),
  defineActorTool(
    actor,
    "get_contact",
    {
      errorSchema: contactReadErrorSchema,
      description:
        "Read current shared contact details and contactRevision before editing or changing archive status.",
      inputSchema: contactReadInput,
      outputSchema: resultSchema,
    },
    (input) => contacts.getContact(actor, input),
  ),
  ...createContactWrites(actor, contacts),
];

const createContactWrites = (actor: Actor, contacts: ContactOperations) => {
  return (
    [
      [
        "create_contact",
        "Create a shared contact. Supply a new contactId UUID and reuse it on retry.",
        contactCommands.create,
      ],
      [
        "update_contact",
        "Update requested shared contact details directly. Current application views resolve the updated profile; their revisions and historical evidence remain unchanged.",
        contactCommands.update,
      ],
      [
        "archive_contact",
        "Archive a contact using expectedContactRevision. Outstanding review requests prevent archiving. Preserves current contact details.",
        contactCommands.archive,
      ],
      [
        "restore_contact",
        "Restore an archived contact using expectedContactRevision, preserving its current details.",
        contactCommands.restore,
      ],
    ] as const
  ).map(([name, description, command]) => {
    const { action, ...fieldsSchema } = command.shape;
    return defineActorTool(
      actor,
      name,
      {
        description,
        inputSchema: z.strictObject(fieldsSchema),
        outputSchema: resultSchema,
        errorSchema: contactWriteErrorSchema,
      },
      async (input) => {
        const result = await contacts.changeContact(
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
  });
};

export type { ContactOperations } from "./operations";
