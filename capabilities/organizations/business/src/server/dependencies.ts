import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";

import type { InvitationMessage } from "../api/records";

export type Dependencies = {
  revokeReviewAccess: (
    tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
    input: {
      organizationId: string;
      membershipId: string;
      userId: string;
      actor: Actor;
      name: string;
    },
  ) => Promise<void>;
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  isOperator: (actor: Actor) => boolean;
  verifiedEmails: (actor: Actor) => Promise<string[]>;
  displayName?: (actor: Actor) => Promise<string | null>;
  sendInvitation: (message: InvitationMessage) => Promise<void>;
  invitationUrl: (token: string) => string;
  networkAddress?: string;
};
