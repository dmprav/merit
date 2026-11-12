import { queryOptions } from "@tanstack/react-query";

import { available, privateKey } from "@merit/query";

import { readWorkspaces, readInvitation } from "./server/organization.functions";
import { readWorkspace } from "./server/workspace.functions";

export const workspacesOptions = () =>
  queryOptions({
    queryKey: [...privateKey, "workspaces"],
    queryFn: ({ signal }) => readWorkspaces({ signal }),
  });

export const workspaceOptions = (slug: string) =>
  queryOptions({
    queryKey: [...privateKey, "workspace", slug, "access"],
    queryFn: async ({ signal }) => available(await readWorkspace({ signal, data: slug })),
  });

export const invitationOptions = (token: string, fingerprint: string) =>
  queryOptions({
    queryKey: [...privateKey, "invitation", fingerprint],
    queryFn: async ({ signal }) => available(await readInvitation({ signal, data: { token } })),
  });

export const invitationFingerprint = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
