import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import type { ContactCommand } from "../api/commands";
import type { ContactService } from "../api/service";
import { changeWorkspaceContact } from "./commands/change-contact";
import type { ContactGrantWork } from "./grant-work";
import { listWorkspaceContacts } from "./queries/directory";
import { listContactSummaries, getContactDetails } from "./queries/reading";

type Dependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  grantWork: ContactGrantWork;
};

export const createContactService = ({ database, grantWork }: Dependencies): ContactService => ({
  listContacts: (actor: Actor, input: Parameters<typeof listWorkspaceContacts>[2]) =>
    database((db) => listWorkspaceContacts(db, actor, input, grantWork)),
  changeContact: (actor: Actor, input: ContactCommand) =>
    database((db) => changeWorkspaceContact(db, actor, input, grantWork)),
  listContactSummaries: (actor: Actor, input: Parameters<typeof listContactSummaries>[2]) =>
    database((db) => listContactSummaries(db, actor, input)),
  getContact: (actor: Actor, input: Parameters<typeof getContactDetails>[2]) =>
    database((db) => getContactDetails(db, actor, input)),
});
