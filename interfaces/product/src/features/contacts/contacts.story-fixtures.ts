import { mocked } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import type { Contact, ContactApplication } from "@merit/contacts-web/contracts";
import type { PageSource } from "@merit/query/contracts";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import {
  readContacts,
  saveContact,
  readContactHistory,
  readContactApplications,
} from "./data/server/contacts.functions";

export const contactApplicationsSource = (
  key: string,
  applications: ContactApplication[],
): PageSource<ContactApplication> => ({
  queryKey: ["story-contact-applications", key],
  read: async (after) => {
    const start = after
      ? applications.findIndex((application) => application.publicId === after) + 1
      : 0;
    const entries = applications.slice(start, start + 20);
    return {
      entries,
      nextCursor: start + 20 < applications.length ? entries.at(-1)!.publicId : null,
    };
  },
});

/** In-memory transport outcomes shared by the directory, editor, and picker examples. */
export const configureContacts = (initial: Contact[]) => {
  let contacts = initial.map((contact) => ({ history: [], applicationTitles: [], ...contact }));
  mocked(readContactApplications).mockImplementation(async ({ data, signal }) => {
    const contact = contacts.find((item) => item.id === data.contactId);
    const page = await contact?.applicationsSource?.read(
      data.after,
      signal ?? new AbortController().signal,
    );
    return {
      status: "ok",
      applications: (page?.entries ?? []).map((entry) => ({
        applicationId: entry.publicId,
        roundId: "m7m2p9x4n6rt",
        title: entry.title,
        roundTitle: entry.roundTitle,
        relationships: entry.relationships,
        applicationVersion: materialVersionSchema.parse(1),
        intakeRevision: 0,
        reviewRevision: reviewRevisionSchema.parse(0),
        recommendationRevision: 0,
        intakeStatus: "in_preparation",
        withdrawn: false,
        requested: null,
        contactId: data.contactId,
        hasWorkingRevision: false,
      })),
      nextCursor: page?.nextCursor ?? null,
    };
  });
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
