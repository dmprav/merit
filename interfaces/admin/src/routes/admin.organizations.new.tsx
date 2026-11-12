import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_administration/admin/organizations/new")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/organizations", replace: true });
  },
});
