export const workspaceHomeLocation = (workspace: {
  slug: string;
  canWorkOnGrants: boolean;
  canViewTeam: boolean;
}) => ({
  to: workspace.canWorkOnGrants
    ? ("/app/$workspaceSlug/rounds" as const)
    : workspace.canViewTeam
      ? ("/app/$workspaceSlug/settings/members" as const)
      : ("/app/$workspaceSlug/work" as const),
  params: { workspaceSlug: workspace.slug },
});
