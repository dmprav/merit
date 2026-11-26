import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import type { OutcomeWait } from "@merit/workflows/outcome";

/**
 * What the delivery workflow receives. `token` is the raw invitation token, the only sensitive
 * field: the payload codec encrypts it, and Postgres stores only its hash, so nothing can
 * recover a lost start. Everything else is an identifier.
 */
export type InvitationWork = { invitationId: string; organizationId: string; token: string };

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
  isOperator: (actor: Actor) => Promise<boolean>;
  verifiedEmails: (actor: Actor) => Promise<string[]>;
  displayName?: (actor: Actor) => Promise<string | null>;
  /**
   * Start the delivery workflow for a committed invitation. Starting what already runs is a
   * no-op, and a failure to start is reported by the implementation and never thrown: the commit
   * stands and the administrator resends. It answers whether the work runs or ran.
   */
  start: (work: InvitationWork) => Promise<boolean>;
  /** How long a request waits for the first delivery outcome. Tests inject short durations. */
  wait?: OutcomeWait;
  networkAddress?: string;
};
