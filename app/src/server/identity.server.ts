import type { Actor, Identity } from "@merit/auth";
import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser, resolveGuestSession } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { Database } from "@merit/db";

export type OrganizationIdentity = {
  isOperator: (actor: Actor) => boolean;
  verifiedEmails: (actor: Actor) => Promise<string[]>;
  displayName: (actor: Actor) => Promise<string | null>;
};

type WebIdentityOptions = {
  database: <T>(operation: (db: Database) => Promise<T>) => Promise<T>;
  guestToken?: string;
  clerk: { secretKey: string; publishableKey: string; browserPublishableKey?: string };
  operatorUserIds: string;
  localActor?: { clerkUserId: string; operator: boolean };
  localIdentity?: Identity;
  localProfile?: { verifiedEmails: string[]; displayName: string };
};

/** Resolve lazily inside Start's request context; never share this instance across requests. */
export const createWebIdentity = ({
  database,
  guestToken,
  clerk,
  operatorUserIds,
  localActor,
  localIdentity,
  localProfile,
}: WebIdentityOptions) => {
  let accountId: string | undefined;
  let actorId: string | undefined;
  let guest = false;
  let resolved: Promise<Identity> | undefined;
  const readProfile = createClerkProfileReader(clerk.secretKey);
  const operators = operatorUserIds.split(",").map((id) => id.trim());

  const currentIdentity = () =>
    (resolved ??= (async (): Promise<Identity> => {
      try {
        if (localIdentity) {
          return localIdentity;
        }

        const configured = Boolean(
          clerk.secretKey || clerk.publishableKey || clerk.browserPublishableKey,
        );
        if (!localActor && configured && !(clerk.secretKey && clerk.browserPublishableKey)) {
          return { status: "unavailable" };
        }

        const account = localActor
          ? { status: "authenticated" as const, clerkUserId: localActor.clerkUserId }
          : clerk.secretKey && clerk.browserPublishableKey
            ? await currentAccount()
            : { status: "signed_out" as const };
        if (account.status === "authenticated") {
          const user = await database((db) => resolveAccountUser(db, account.clerkUserId));
          if (user.status === "disabled") {
            return { status: "unavailable" };
          }

          accountId = account.clerkUserId;
          actorId = user.userId;
          return { status: "authenticated", actor: { userId: user.userId } };
        }

        const session = guestToken
          ? await database((db) => resolveGuestSession(db, guestToken))
          : null;
        guest = !!session;
        return session
          ? { status: "authenticated", actor: { userId: session.userId } }
          : { status: "signed_out" };
      } catch {
        return { status: "unavailable" };
      }
    })());

  const profile = async (actor: Actor) => {
    const identity = await currentIdentity();
    if (identity.status !== "authenticated" || identity.actor.userId !== actor.userId) {
      return { verifiedEmails: [], displayName: null };
    }
    if (localProfile) {
      return localProfile;
    }

    return accountId ? readProfile(accountId) : { verifiedEmails: [], displayName: "Dana Reed" };
  };

  const organizationIdentity: OrganizationIdentity = {
    isOperator: (actor) =>
      actor.userId === actorId &&
      !!accountId &&
      (localActor ? localActor.operator : operators.includes(accountId)),
    verifiedEmails: async (actor) => (await profile(actor)).verifiedEmails,
    displayName: async (actor) => (await profile(actor)).displayName,
  };

  return {
    currentIdentity,
    isGuest: async () => {
      await currentIdentity();
      return guest;
    },
    organizationIdentity,
  };
};
