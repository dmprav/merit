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

export type Contact = Omit<DirectoryContact, "applicationTitles"> & {
  applicationTitles?: string[];
  applicationsSource?: PageSource<ContactApplication>;
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
  scope: (workspaceSlug: string) => readonly unknown[];
  read: (
    workspaceSlug: string,
    signal?: AbortSignal,
  ) => Promise<ContactDirectory | { status: "not_found" | "signed_out" | "unavailable" }>;
  save: ContactsData["save"];
};
