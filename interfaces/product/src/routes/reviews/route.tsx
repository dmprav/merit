import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_product/reviews")({
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: Outlet,
});
