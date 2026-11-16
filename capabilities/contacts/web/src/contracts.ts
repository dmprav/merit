import type { ContactHistoryEntry } from "@merit/contacts/api";
import type {
  DirectoryContact,
  ContactDirectory,
  ContactCommand,
  SaveContactResult,
} from "@merit/contacts/api";
import type { PageSource } from "@merit/query/contracts";

export type ContactApplication = {
  publicId: string;
  title: string;
  roundTitle: string;
  relationships: ("applicant_contact" | "review_requested" | "assessment_recorded")[];
};

export type Contact = Omit<DirectoryContact, "applicationTitles" | "history"> & {
  applicationTitles?: string[];
  history?: ContactHistoryEntry[];
  applicationsSource?: PageSource<ContactApplication>;
  historySource?: PageSource<ContactHistoryEntry>;
};

export type ContactsData = {
  contacts: Contact[];
  readFailed: boolean;
  save: (
    input: ContactCommand,
  ) => Promise<SaveContactResult | { status: "signed_out" | "unavailable" }>;
  refresh: () => Promise<void>;
  refreshCurrent: () => Promise<void>;
};

export type ContactsSource = {
  applications?: (workspaceSlug: string, contact: Contact) => PageSource<ContactApplication>;
  history?: (workspaceSlug: string, contact: Contact) => PageSource<ContactHistoryEntry>;
  scope: (workspaceSlug: string) => readonly unknown[];
  read: (
    workspaceSlug: string,
    signal?: AbortSignal,
  ) => Promise<ContactDirectory | { status: "not_found" | "signed_out" | "unavailable" }>;
  save: ContactsData["save"];
};
