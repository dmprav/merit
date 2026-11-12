import type {
  DirectoryContact,
  ContactDirectory,
  ContactCommand,
  SaveContactResult,
} from "@merit/contacts/api";

export type Contact = Omit<DirectoryContact, "applicationTitles" | "history"> & {
  applicationTitles?: string[];
  history?: DirectoryContact["history"];
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
  scope: (workspaceSlug: string) => readonly unknown[];
  read: (
    workspaceSlug: string,
    signal?: AbortSignal,
  ) => Promise<ContactDirectory | { status: "not_found" | "signed_out" | "unavailable" }>;
  save: ContactsData["save"];
};
