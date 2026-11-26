import type { Actor } from "@merit/auth";
import type { Database } from "@merit/db";
import type { OutcomeWait } from "@merit/workflows/outcome";

/** The delivery workflow receives the token through the encrypted payload codec. */
export type InvitationWork = { invitationId: string; token: string };

export type Dependencies = {
  invitationKey: () => Uint8Array;
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
   * stands and reconciliation retries the handoff. It answers whether the work runs or ran.
   */
  start: (work: InvitationWork) => Promise<boolean>;
  /** How long a request waits for the first delivery outcome. Tests inject short durations. */
  wait?: OutcomeWait;
  /**
   * Called when reading the outcome fails after the invitation committed. The request still
   * answers `pending`: the workflow keeps delivering, and the administrator sees the stored status.
   */
  onOutcomeError?: () => void;
  networkAddress?: string;
};
