import type { Identity } from "@merit/auth";
import {
  defaultLocalPersona,
  localPersona,
  readLocalPersonCookie,
} from "@merit/auth/local-personas";

const isLoopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export const allowsLocalWorkspaceRequest = (request: Request) => {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");

  return (
    isLoopback(url.hostname) &&
    url.protocol === "http:" &&
    (origin === null || origin === url.origin)
  );
};

export const localWorkspaceIdentity = async (): Promise<Identity> => ({
  status: "authenticated",
  actor: { userId: "local-workspace-manager" },
});

export const localWorkspaceProfile = {
  verifiedEmails: [defaultLocalPersona.email],
  displayName: defaultLocalPersona.name,
};

// These fictional identities are only selected inside the loopback-only development mode.
export const localProvisioningIdentity = (request: Request) => {
  const person = localPersona(readLocalPersonCookie(request.headers.get("cookie")));
  if (person.id === "manager") {
    return undefined;
  }
  return {
    actor: { clerkUserId: `local_${person.id}` },
    operator: person.id === "operator",
    emails: [person.email],
    displayName: person.name,
  };
};
