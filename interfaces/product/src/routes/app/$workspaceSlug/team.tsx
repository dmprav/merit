import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_product/app/$workspaceSlug/team")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/$workspaceSlug/settings/members", params, replace: true });
  },
});
