import type { Actor, Identity } from "@merit/auth";
import { createClerkProfileReader } from "@merit/auth/clerk-users";
import { resolveAccountUser, resolveGuestSession } from "@merit/auth/server";
import { currentAccount } from "@merit/auth/session";
import type { DatabaseRunner } from "@merit/db";
import { setSpanAttributes, withSpan, type Span } from "@merit/telemetry";

export type OrganizationIdentity = {
  isOperator: (actor: Actor) => boolean;
  verifiedEmails: (actor: Actor) => Promise<string[]>;
  displayName: (actor: Actor) => Promise<string | null>;
};

export const createClerkIdentitySupport = (secretKey: string, operatorUserIds: string) => {
  const operators = new Set(
    operatorUserIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const readProfile = createClerkProfileReader(secretKey);

  return {
    isOperatorAccount: (clerkUserId: string) => operators.has(clerkUserId),
    readProfile,
  };
};

type WebIdentityOptions = {
  database: DatabaseRunner;
  guestToken?: string;
  clerk: { secretKey: string; publishableKey: string; browserPublishableKey?: string };
  operatorUserIds: string;
  localActor?: { clerkUserId: string; operator: boolean };
  localIdentity?: Identity;
  localProfile?: { verifiedEmails: string[]; displayName: string | null };
};

type ResolvedWebSession = {
  identity: Identity;
  accountId: string | undefined;
  isGuest: boolean;
  operator: boolean;
};

const emptySession = (identity: Identity): ResolvedWebSession => ({
  identity,
  accountId: undefined,
  isGuest: false,
  operator: false,
});

const resolveAccountSource = async (
  clerk: WebIdentityOptions["clerk"],
  localActor: WebIdentityOptions["localActor"],
) => {
  if (localActor) {
    return { status: "authenticated" as const, clerkUserId: localActor.clerkUserId };
  }
  const hasAnyClerkKey = Boolean(
    clerk.secretKey || clerk.publishableKey || clerk.browserPublishableKey,
  );
  if (!hasAnyClerkKey) {
    return { status: "signed_out" as const };
  }
  if (!clerk.secretKey || !clerk.browserPublishableKey) {
    return { status: "unavailable" as const };
  }
  return currentAccount();
};

const resolveAuthenticatedSession = async (
  database: DatabaseRunner,
  clerkUserId: string,
  operator: boolean,
): Promise<ResolvedWebSession> => {
  const user = await database((db) => resolveAccountUser(db, clerkUserId));
  if (user.status === "disabled") {
    return emptySession({ status: "unavailable" });
  }
  return {
    identity: { status: "authenticated", actor: { userId: user.userId } },
    accountId: clerkUserId,
    isGuest: false,
    operator,
  };
};

const resolveWebSessionUncached = async (
  span: Span,
  {
    database,
    guestToken,
    clerk,
    isOperatorAccount,
    localActor,
    localIdentity,
  }: Pick<
    WebIdentityOptions,
    "database" | "guestToken" | "clerk" | "localActor" | "localIdentity"
  > & {
    isOperatorAccount: (clerkUserId: string) => boolean;
  },
): Promise<ResolvedWebSession> => {
  try {
    if (localIdentity) {
      return {
        identity: localIdentity,
        accountId: localActor?.clerkUserId,
        isGuest: false,
        operator: localIdentity.status === "authenticated" && Boolean(localActor?.operator),
      };
    }

    const account = await resolveAccountSource(clerk, localActor);
    if (account.status === "unavailable") {
      return emptySession({ status: "unavailable" });
    }
    if (account.status === "authenticated") {
      const operator = localActor ? localActor.operator : isOperatorAccount(account.clerkUserId);
      return await resolveAuthenticatedSession(database, account.clerkUserId, operator);
    }

    const session = guestToken ? await database((db) => resolveGuestSession(db, guestToken)) : null;
    if (!session) {
      return emptySession({ status: "signed_out" });
    }
    return {
      identity: { status: "authenticated", actor: { userId: session.userId } },
      accountId: undefined,
      isGuest: true,
      operator: false,
    };
  } catch {
    span.setAttribute("error.type", "SessionResolutionError");
    return emptySession({ status: "unavailable" });
  }
};

const resolveWebSessionState = (
  options: Pick<
    WebIdentityOptions,
    "database" | "guestToken" | "clerk" | "localActor" | "localIdentity"
  > & {
    isOperatorAccount: (clerkUserId: string) => boolean;
  },
): Promise<ResolvedWebSession> =>
  withSpan("auth.resolve_web_session", async (span) => {
    const resolved = await resolveWebSessionUncached(span, options);
    const mode = options.localIdentity
      ? "local"
      : resolved.isGuest
        ? "guest"
        : resolved.identity.status === "authenticated"
          ? "clerk"
          : resolved.identity.status;
    setSpanAttributes(span, {
      "merit.auth.mode": mode,
      "merit.auth.status": resolved.identity.status,
      "merit.auth.operator": resolved.operator,
    });
    return resolved;
  });

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
  const { isOperatorAccount, readProfile } = createClerkIdentitySupport(
    clerk.secretKey,
    operatorUserIds,
  );
  let resolvedSession: ResolvedWebSession | undefined;
  let sessionPromise: Promise<ResolvedWebSession> | undefined;

  const resolveSession = () =>
    (sessionPromise ??= resolveWebSessionState({
      database,
      guestToken,
      clerk,
      isOperatorAccount,
      localActor,
      localIdentity,
    }).then((session) => {
      resolvedSession = session;
      return session;
    }));

  const currentIdentity = async () => (await resolveSession()).identity;

  const profile = async (actor: Actor) => {
    const session = await resolveSession();
    if (
      session.identity.status !== "authenticated" ||
      session.identity.actor.userId !== actor.userId
    ) {
      return { verifiedEmails: [], displayName: null };
    }
    if (localProfile) {
      return localProfile;
    }

    return session.accountId
      ? readProfile(session.accountId)
      : { verifiedEmails: [], displayName: null };
  };

  const organizationIdentity: OrganizationIdentity = {
    isOperator: (actor) =>
      resolvedSession?.identity.status === "authenticated" &&
      resolvedSession.identity.actor.userId === actor.userId &&
      resolvedSession.operator,
    verifiedEmails: async (actor) => (await profile(actor)).verifiedEmails,
    displayName: async (actor) => (await profile(actor)).displayName,
  };

  return {
    currentIdentity,
    isGuest: async () => (await resolveSession()).isGuest,
    organizationIdentity,
  };
};
