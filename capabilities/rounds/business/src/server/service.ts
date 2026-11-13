import type { Database } from "@merit/db";

type DatabaseAccess = <T>(operation: (db: Database) => Promise<T>) => Promise<T>;

import type { RoundsService } from "../api/service";
import { createFundingRound, editFundingRound, deleteFundingRound } from "./commands/preparation";
import type { RoundApplications } from "./grant-work";

export const createRoundsService = ({
  database,
  roundHasApplications,
}: {
  database: DatabaseAccess;
  roundHasApplications: RoundApplications;
}): RoundsService => ({
  createRound: (actor, input) => database((db) => createFundingRound(db, actor, input)),
  editRound: (actor, input) => database((db) => editFundingRound(db, actor, input)),
  deleteRound: (actor, input) =>
    database((db) => deleteFundingRound(db, actor, input, roundHasApplications)),
});
