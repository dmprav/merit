import { createFileRoute } from "@tanstack/react-router";

import { readDemo } from "../features/demo/data/server/demo.functions";
import { DemoEntry } from "../features/demo/demo-entry";

const WorkshopDemoPage = () => <DemoEntry initial={Route.useLoaderData()} guided />;

export const Route = createFileRoute("/_product/demo_/workshop-saturdays")({
  loader: () => readDemo(),
  staleTime: 0,
  gcTime: 0,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: WorkshopDemoPage,
});
