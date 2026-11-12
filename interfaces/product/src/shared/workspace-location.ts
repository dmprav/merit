export const workspaceHomeLocation = (workspace: { slug: string; canWorkOnGrants: boolean }) => ({
  to: workspace.canWorkOnGrants
    ? ("/app/$workspaceSlug/rounds" as const)
    : ("/app/$workspaceSlug/settings/members" as const),
  params: { workspaceSlug: workspace.slug },
});
