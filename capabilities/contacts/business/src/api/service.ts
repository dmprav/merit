import type { z } from "zod";

import type { Actor } from "@merit/auth";

import type { ContactCommand, SaveContactResult } from "./commands";
import type {
  contactsRequestSchema,
  contactListInput,
  contactReadInput,
  ContactDirectory,
  ContactSummaryPage,
  ContactSummary,
} from "./queries";

type NotFound = { status: "not_found" };

export interface ContactService {
  listContacts: (
    actor: Actor,
    input: z.input<typeof contactsRequestSchema>,
  ) => Promise<ContactDirectory | NotFound>;
  changeContact: (actor: Actor, input: ContactCommand) => Promise<SaveContactResult>;
  listContactSummaries: (
    actor: Actor,
    input: z.input<typeof contactListInput>,
  ) => Promise<ContactSummaryPage | NotFound>;
  getContact: (
    actor: Actor,
    input: z.input<typeof contactReadInput>,
  ) => Promise<{ status: "ok"; contact: ContactSummary } | NotFound>;
}
