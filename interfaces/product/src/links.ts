/** Pure destination definitions, safe for browser and server composition. */
export const productLinks = {
  review: (workspaceSlug: string, id: string) =>
    `/app/${encodeURIComponent(workspaceSlug)}/work/${encodeURIComponent(id)}`,
  invitation: (token: string) => `/invitations/${encodeURIComponent(token)}`,
  application: (workspaceSlug: string, applicationRef: string, search?: { tab?: "reviews" }) => {
    const path = `/app/${encodeURIComponent(workspaceSlug)}/applications/${encodeURIComponent(applicationRef)}`;
    return search?.tab ? `${path}?tab=${encodeURIComponent(search.tab)}` : path;
  },
  signIn: "/app/sign-in",
};
