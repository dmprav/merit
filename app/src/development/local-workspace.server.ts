import type { WorkspaceServices } from "@merit/product/context";

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

export const localWorkspaceIdentity: WorkspaceServices["currentIdentity"] = async () => ({
  status: "authenticated",
  actor: { userId: "local-workspace-manager" },
});

export const localWorkspaceProfile = {
  verifiedEmails: ["dana@example.test"],
  displayName: "Dana Reed",
};

// These fictional identities are only selected inside the loopback-only development mode.
export const localProvisioningIdentity = (request: Request) => {
  const fixture = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("merit-local-person="))
    ?.split("=")[1];
  if (fixture === "operator") {
    return {
      actor: { clerkUserId: "local_operator" },
      operator: true,
      emails: ["operator@example.test"],
      displayName: "Merit operator",
    };
  }
  if (fixture === "recipient") {
    return {
      actor: { clerkUserId: "local_recipient" },
      operator: false,
      emails: ["recipient@example.test"],
      displayName: "Invitation recipient",
    };
  }

  return undefined;
};
