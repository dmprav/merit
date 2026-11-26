import type { Database } from "@merit/db";
import { waitForOutcome, type OutcomeWait } from "@merit/workflows/outcome";

import type { InvitationMessage } from "../../api/records";
import type { InvitationWork } from "../dependencies";
import { hashToken } from "../invitation-token";
import { recordDelivery } from "../persistence/commands/provisioning";
import {
  acknowledgeInvitationDispatch,
  readInvitationForDelivery,
} from "../persistence/invitations";
import { readScoped, writeScoped } from "../persistence/tenant";
import type { IssuedInvitation } from "./issue-invitation";

/** Durations in milliseconds. Tests inject short ones through the workflow input. */
export type InvitationDeliveryTiming = {
  /** Each send attempt. */
  attemptTimeoutMs: number;
  /** Automatic attempts stop this long after the first. */
  windowMs: number;
  initialIntervalMs: number;
  maximumIntervalMs: number;
};

export type InvitationDeliveryInput = InvitationWork & {
  timing?: Partial<InvitationDeliveryTiming>;
};

/** The workflow ID of an invitation: starting the same invitation twice cannot duplicate it. */
export const organizationInvitationWorkflowId = (invitationId: string) =>
  `organization-invitation:${invitationId}`;

type Status = "pending" | "sent" | "failed";

type DatabaseAccess = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
};

/** What one delivery attempt needs to send and record the invitation. */
export type InvitationActivityDependencies = DatabaseAccess & {
  sendInvitation: (message: InvitationMessage) => Promise<void>;
  invitationUrl: (token: string) => string;
};

export type InvitationDeliveryDependencies = DatabaseAccess & {
  start: (work: InvitationWork) => Promise<boolean>;
  wait?: OutcomeWait;
  /** Told when reading the outcome fails; the request still answers `pending`. */
  onOutcomeError?: () => void;
};

// The token's hash alone opens its invitation and the organization's name, with no member
// access, so delivery continues while the inviter's own access changes. This is the scope the
// invitation was always delivered and recorded under.
const scopeOf = async (work: InvitationWork) => ({
  kind: "invitation" as const,
  tokenHash: await hashToken(work.token),
});

const readCurrent = async (database: DatabaseAccess["database"], work: InvitationWork) => {
  const scope = await scopeOf(work);
  return database((db) =>
    readScoped(db, scope, (tx) => readInvitationForDelivery(tx, work.invitationId)),
  );
};

/** An invitation still awaiting its email: not revoked, accepted or expired. */
const awaitingEmail = (row: NonNullable<Awaited<ReturnType<typeof readCurrent>>>) =>
  !row.invitation.revokedAt && !row.invitation.acceptedAt && row.invitation.expiresAt > new Date();

const record = async (
  database: DatabaseAccess["database"],
  work: InvitationWork,
  delivery: "sent" | "failed",
) => {
  const scope = await scopeOf(work);
  await database((db) =>
    writeScoped(db, scope, (tx) => recordDelivery(tx, work.invitationId, delivery)),
  );
};

/**
 * Deliver a committed invitation: start the workflow that sends it, then wait briefly for the
 * first outcome. The result is what the request can say now; `pending` means the workflow is
 * still retrying or Temporal has not started it. The administrator sees the stored status.
 */
export const deliverInvitation = async (
  dependencies: InvitationDeliveryDependencies,
  invitation: IssuedInvitation,
): Promise<Status | "unavailable"> => {
  const work = {
    invitationId: invitation.record.id,
    token: invitation.token,
  };
  const started = await dependencies.start(work);
  if (!started) {
    return "pending";
  }
  // The invitation is committed and the workflow delivers it: a failing read must not fail the request.
  try {
    const acknowledged = dependencies.database((db) =>
      acknowledgeInvitationDispatch(db, work.invitationId, invitation.record.tokenHash),
    );
    const outcome = await waitForOutcome(async () => {
      await acknowledged;
      const row = await readCurrent(dependencies.database, work);
      if (!row || !awaitingEmail(row)) {
        return "unavailable" as const;
      }
      return row.invitation.delivery === "pending" ? undefined : row.invitation.delivery;
    }, dependencies.wait);
    return outcome ?? "pending";
  } catch {
    dependencies.onOutcomeError?.();
    return "pending";
  }
};

/**
 * One delivery attempt, run by the workflow's send activity. The invitation is read again, so a
 * revoked, accepted, expired or replaced invitation stops the work. A send failure throws, so
 * the activity retries with backoff.
 */
const sendOrganizationInvitation = async (
  dependencies: InvitationActivityDependencies,
  work: InvitationWork,
): Promise<"sent" | "stopped"> => {
  const row = await readCurrent(dependencies.database, work);
  if (!row || !awaitingEmail(row)) {
    return "stopped";
  }
  const { invitation, organizationName } = row;
  if (invitation.delivery === "sent") {
    return "sent";
  }
  await dependencies.sendInvitation({
    id: invitation.id,
    to: invitation.email,
    organizationName,
    expiresAt: invitation.expiresAt,
    administration: invitation.administration,
    role: invitation.role,
    url: dependencies.invitationUrl(work.token),
  });
  await record(dependencies.database, work, "sent");
  return "sent";
};

/** Record the final failure after the retry window, unless the invitation was sent or replaced. */
const failOrganizationInvitation = async (
  dependencies: DatabaseAccess,
  work: InvitationWork,
): Promise<"failed" | "sent" | "stopped"> => {
  const row = await readCurrent(dependencies.database, work);
  if (!row || row.invitation.revokedAt || row.invitation.acceptedAt) {
    return "stopped";
  }
  if (row.invitation.delivery === "sent") {
    return "sent";
  }
  await record(dependencies.database, work, "failed");
  return "failed";
};

/** The activities the delivery workflow calls, bound to a database and an email sender. */
export const createInvitationActivities = (dependencies: InvitationActivityDependencies) => ({
  sendOrganizationInvitation: (work: InvitationWork) =>
    sendOrganizationInvitation(dependencies, work),
  failOrganizationInvitation: (work: InvitationWork) =>
    failOrganizationInvitation(dependencies, work),
});

export type InvitationActivities = ReturnType<typeof createInvitationActivities>;
