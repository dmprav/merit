import { createFileRoute } from "@tanstack/react-router";

import { readDemo } from "../features/demo/data/server/demo.functions";
import { DemoEntry } from "../features/demo/demo-entry";

const DemoPage = () => <DemoEntry initial={Route.useLoaderData()} />;

export const Route = createFileRoute("/_product/demo")({
  loader: () => readDemo(),
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: DemoPage,
});
