import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_product/reviews/")({
  beforeLoad: () => {
    throw redirect({ to: "/app", replace: true });
  },
});
