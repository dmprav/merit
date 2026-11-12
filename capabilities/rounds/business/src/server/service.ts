import type { Database } from "@merit/db";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { RoundsService } from "../api/service";
import {
  createFundingRound,
  editFundingRound,
  deleteFundingRound,
  type RecordRoundAudit,
} from "./commands/preparation";
import type { RoundApplications } from "./grant-work";

export const createRoundsService = ({
  database,
  roundHasApplications,
  recordAuditEvent,
}: {
  database: DatabaseAccess;
  roundHasApplications: RoundApplications;
  recordAuditEvent: RecordRoundAudit;
}): RoundsService => ({
  createRound: (actor, input) =>
    database((db) => createFundingRound(db, actor, input, recordAuditEvent)),
  editRound: (actor, input) =>
    database((db) => editFundingRound(db, actor, input, recordAuditEvent)),
  deleteRound: (actor, input) =>
    database((db) => deleteFundingRound(db, actor, input, roundHasApplications, recordAuditEvent)),
});
