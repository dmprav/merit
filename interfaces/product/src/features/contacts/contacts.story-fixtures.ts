import { mocked } from "storybook/test";

import type { Contact } from "@merit/contacts-web/contracts";

import { readContacts, saveContact, readContactHistory } from "./data/server/contacts.functions";

/** In-memory transport outcomes shared by the directory, editor, and picker examples. */
export const configureContacts = (initial: Contact[]) => {
  let contacts = initial.map((contact) => ({ history: [], applicationTitles: [], ...contact }));
  mocked(readContactHistory).mockImplementation(async ({ data }) => ({
    status: "ok",
    entries: (contacts.find((contact) => contact.id === data.contactId)?.history ?? []).map(
      (entry) => ({ ...entry, actorUserId: null }),
    ),
    nextCursor: null,
  }));
  mocked(readContacts).mockImplementation(async () => ({
    status: "ok",
    workspaceName: "Alder Foundation",
    contacts,
  }));
  mocked(saveContact).mockImplementation(async ({ data }) => {
    const current = contacts.find((contact) => contact.id === data.contactId);
    if (data.action !== "create" && current?.revision !== data.expectedContactRevision) {
      return { status: "conflict" };
    }
    const contact = {
      name: "",
      email: "",
      affiliation: "",
      archived: false,
      history: [],
      applicationTitles: [],
      ...current,
      ...("details" in data ? data.details : {}),
      organizationId: "preview-organization",
      id: data.contactId,
      revision: current ? current.revision + 1 : 0,
    };
    if (data.action === "archive" || data.action === "restore") {
      contact.archived = data.action === "archive";
    }
    contacts = [...contacts.filter((item) => item.id !== contact.id), contact];
    return { status: "ok", contact };
  });
};
