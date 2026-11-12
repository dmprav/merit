import type { Database } from "@merit/db";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { ApplicationsService } from "../api/service";
import { selectApplicationContact } from "./commands/application-contact";
import {
  createFundingApplication,
  editFundingApplication,
  type RecordApplicationAudit,
} from "./commands/intake";
import type { ApplicationWork } from "./grant-work";

export const createApplicationsService = ({
  database,
  work,
  recordAuditEvent,
}: {
  database: DatabaseAccess;
  work: ApplicationWork;
  recordAuditEvent: RecordApplicationAudit;
}): ApplicationsService => ({
  createApplication: (actor, input) =>
    database((db) => createFundingApplication(db, actor, input, recordAuditEvent)),
  editApplication: (actor, input) =>
    database((db) => editFundingApplication(db, actor, input, work, recordAuditEvent)),
  selectContact: (actor, input) => database((db) => selectApplicationContact(db, actor, input)),
});
