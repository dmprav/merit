import { workspaceHomeLocation } from "./shared/workspace-location";

/** Pure destination definitions, safe for browser and server composition. */
export const productLinks = {
  workspaceHome: (workspace: Parameters<typeof workspaceHomeLocation>[0]) => {
    const { to, params } = workspaceHomeLocation(workspace);
    return to.replace("$workspaceSlug", encodeURIComponent(params.workspaceSlug));
  },
  review: (workspaceSlug: string, id: string) =>
    `/app/${encodeURIComponent(workspaceSlug)}/work/${encodeURIComponent(id)}`,
  invitation: (token: string) => `/invitations/${encodeURIComponent(token)}`,
  application: (workspaceSlug: string, applicationRef: string, search?: { tab?: "reviews" }) => {
    const path = `/app/${encodeURIComponent(workspaceSlug)}/applications/${encodeURIComponent(applicationRef)}`;
    return search?.tab ? `${path}?tab=${encodeURIComponent(search.tab)}` : path;
  },
  signIn: "/app/sign-in",
};
