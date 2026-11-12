import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import type { NavigationService } from "../api/navigation";
import type { GrantmakingQueries } from "../api/service";
import { changeNavigationPin } from "./commands/navigation";
import { listWorkspaceApplications } from "./queries/application-overview";
import { readNavigationPins } from "./queries/navigation";
import { getFundingApplicationPage, getFundingRoundPage, listFundingRounds } from "./queries/pages";
import {
  listApplicationReviewSummaries,
  listContactApplications,
  listFundingRoundSummaries,
  getFundingRoundOverview,
  listFundingApplications,
  getFundingApplicationContext,
  getFundingRoundContent,
  getFundingApplicationContent,
  listFundingRoundHistory,
  listFundingApplicationHistory,
} from "./queries/reading";

type Dependencies = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
};

export const createNavigationService = ({
  database,
  verifiedEmails,
}: Dependencies & {
  verifiedEmails: (actor: Actor) => Promise<string[]>;
}): NavigationService => ({
  read: async (actor) => {
    const emails = await verifiedEmails(actor);
    return database((db) => readNavigationPins(db, actor, emails));
  },
  change: async (actor, input) => {
    const emails = await verifiedEmails(actor);
    return database((db) => changeNavigationPin(db, actor, emails, input));
  },
});

export const createGrantmakingService = ({ database }: Dependencies): GrantmakingQueries => ({
  readApplicationPage: (actor, input) =>
    database((db) => getFundingApplicationPage(db, actor, input)),
  readRoundPage: (actor, input) => database((db) => getFundingRoundPage(db, actor, input)),
  listWorkspaceApplications: (actor, slug) =>
    database((db) => listWorkspaceApplications(db, actor, slug)),
  listRounds: (actor, input) => database((db) => listFundingRounds(db, actor, input)),
  listReviews: (actor, input) => database((db) => listApplicationReviewSummaries(db, actor, input)),
  listContactApplications: (actor, input) =>
    database((db) => listContactApplications(db, actor, input)),
  listRoundSummaries: (actor, input) =>
    database((db) => listFundingRoundSummaries(db, actor, input)),
  readRound: (actor, input) => database((db) => getFundingRoundOverview(db, actor, input)),
  listApplications: (actor, input) => database((db) => listFundingApplications(db, actor, input)),
  readApplication: (actor, input) =>
    database((db) => getFundingApplicationContext(db, actor, input)),
  roundContent: (actor, input) => database((db) => getFundingRoundContent(db, actor, input)),
  applicationContent: (actor, input) =>
    database((db) => getFundingApplicationContent(db, actor, input)),
  roundHistory: (actor, input) => database((db) => listFundingRoundHistory(db, actor, input)),
  applicationHistory: (actor, input) =>
    database((db) => listFundingApplicationHistory(db, actor, input)),
});
