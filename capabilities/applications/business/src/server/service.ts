import type { Database } from "@merit/db";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { ApplicationsService } from "../api/service";
import { selectApplicationContact } from "./commands/application-contact";
import { createFundingApplication, editFundingApplication } from "./commands/intake";
import type { ApplicationWork } from "./grant-work";

export const createApplicationsService = ({
  database,
  work,
}: {
  database: DatabaseAccess;
  work: ApplicationWork;
}): ApplicationsService => ({
  createApplication: (actor, input) => database((db) => createFundingApplication(db, actor, input)),
  editApplication: (actor, input) =>
    database((db) => editFundingApplication(db, actor, input, work)),
  selectContact: (actor, input) => database((db) => selectApplicationContact(db, actor, input)),
});
