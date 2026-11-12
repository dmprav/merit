import { useHydrated } from "@tanstack/react-router";

import type { DemoState } from "./contracts";
import { useDemoEntry } from "./controllers/use-demo-entry";
import { startDemoData } from "./data/demo";
import { DemoEntryView } from "./views/demo-entry";

export const enterDemo = (state: Extract<DemoState, { status: "ready" }>, guided = false) => {
  const root = `/app/${state.workspaceSlug}`;
  // A full navigation discards the anonymous/pre-reset query cache and mounted drafts.
  window.location.replace(
    guided && state.applicationRef
      ? `${root}/applications/${state.applicationRef}?guide=workshop`
      : `${root}/rounds`,
  );
};

export const DemoEntry = ({
  initial,
  guided = false,
}: {
  initial: DemoState;
  guided?: boolean;
}) => {
  const hydrated = useHydrated();
  const state = useDemoEntry(initial, startDemoData, enterDemo, guided);
  return <DemoEntryView {...state} hydrated={hydrated} />;
};
