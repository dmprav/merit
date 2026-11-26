import type { Database } from "@merit/db";
import type { WorkspaceChangeObserver } from "@merit/organizations/domain";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { DecisionsService } from "../api/service";
import { recordCommitteeDecision } from "./commands/decisions";

export const createDecisionsService = ({
  database,
  onSaved,
}: {
  database: DatabaseAccess;
  onSaved?: WorkspaceChangeObserver;
}): DecisionsService => ({
  recordDecision: (actor, input) =>
    database((db) => recordCommitteeDecision(db, actor, input, onSaved)),
});
