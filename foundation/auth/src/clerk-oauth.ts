import { createClerkClient } from "@clerk/backend";
import { decodeJwt } from "@clerk/backend/jwt";

import { AuthenticationError } from "./index";

type ClerkOAuthConfig = {
  publishableKey: string;
  secretKey: string;
  issuer: string;
  resource: string;
};

type VerifiedClerkIdentity = {
  clerkUserId: string;
  clientId: string;
  scopes: readonly string[];
};

export const verifyClerkOAuth = async (
  request: Request,
  config: ClerkOAuthConfig,
): Promise<VerifiedClerkIdentity> => {
  if (!config.publishableKey || !config.secretKey || !config.issuer) {
    throw new AuthenticationError("unavailable");
  }

  // Only delegated OAuth access tokens establish identity here; website cookies do not.
  const bearer = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!bearer) {
    throw new AuthenticationError("unauthenticated");
  }

  const clerk = createClerkClient({
    publishableKey: config.publishableKey,
    secretKey: config.secretKey,
  });
  let auth;
  try {
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "oauth_token",
      audience: config.resource,
    });
    auth = state.toAuth();
    // Clerk verifies the signature and audience; also bind JWTs to the advertised issuer.
    // Opaque tokens are verified by this Clerk instance's API.
    if (
      auth.isAuthenticated &&
      bearer.split(".").length === 3 &&
      decodeJwt(bearer).payload.iss !== config.issuer
    ) {
      throw new AuthenticationError("unauthenticated");
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError("unavailable");
  }

  if (!auth.isAuthenticated || !auth.userId) {
    throw new AuthenticationError("unauthenticated");
  }
  if (!auth.clientId) {
    throw new AuthenticationError("unauthenticated");
  }

  return {
    clerkUserId: auth.userId,
    clientId: auth.clientId,
    scopes: auth.scopes,
  };
};
