import { z } from "zod";

import { auditPageInput } from "@merit/audit/api";
import { workspaceSlugSchema } from "@merit/organizations/api";

import { contactAddress } from "./identifiers";
import type { ContactRecord, ContactHistoryEntry } from "./records";

export const contactsRequestSchema = z.strictObject({ workspaceSlug: workspaceSlugSchema });

export type DirectoryContact = Omit<ContactRecord, "organizationId"> & {
  applicationTitles: string[];
};

export type ContactDirectory = {
  status: "ok";
  contacts: DirectoryContact[];
  workspaceName: string;
};

export const contactListInput = z.strictObject({
  workspaceSlug: workspaceSlugSchema,
  after: z.uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
  archived: z.boolean().optional(),
});
export const contactReadInput = z.strictObject(contactAddress);
export const contactHistoryInput = contactReadInput.extend(auditPageInput.shape);

export type ContactSummary = Omit<ContactRecord, "id" | "organizationId" | "revision"> & {
  contactId: string;
  contactRevision: number;
};

export type ContactSummaryPage = {
  status: "ok";
  contacts: ContactSummary[];
  nextCursor: string | null;
};

export type ContactHistoryPage = {
  status: "ok";
  entries: (ContactHistoryEntry & { actorUserId: string | null })[];
  nextCursor: string | null;
};
