import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_administration/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/organizations" });
  },
});
