import { useQuery } from "@tanstack/react-query";
import { useHydrated, useLocation } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { clearDrafts } from "@merit/drafts";

import { WorkspaceNavigationContext } from "../workspace/workspace-navigation";
import { useDemoReset } from "./controllers/use-demo-reset";
import { demoOptions, startDemoData } from "./data/demo";
import { enterDemo } from "./demo-entry";
import { DemoToolsView } from "./views/demo-tools";

const Guidance = createContext({ open: false, setOpen: (_open: boolean) => {} });

export const DemoGuidance = ({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const introduced = useRef(false);
  const search = useLocation({ select: (location) => location.searchStr });

  useEffect(() => {
    if (introduced.current) {
      return;
    }
    introduced.current = true;
    setOpen(new URLSearchParams(search).get("guide") === "workshop");
  }, [search]);

  return <Guidance value={{ open, setOpen }}>{children}</Guidance>;
};

export const DemoTools = ({
  workspace,
}: {
  workspace: { id: string; slug: string; demoExpiresAt?: string | null };
}) => {
  const { open, setOpen } = useContext(Guidance);
  const { draftScope } = useContext(WorkspaceNavigationContext);
  const hydrated = useHydrated();
  const guide = useQuery({ ...demoOptions(workspace.slug), enabled: open });
  const destinations =
    guide.data?.status === "ready" && guide.data.workspaceSlug === workspace.slug
      ? guide.data
      : undefined;
  const reset = useDemoReset(workspace.id, startDemoData, async (ready) => {
    if (draftScope) {
      await clearDrafts(draftScope);
    }
    enterDemo(ready);
  });

  return (
    <DemoToolsView
      workspace={workspace}
      hydrated={hydrated}
      open={open}
      setOpen={setOpen}
      destinations={destinations}
      loading={guide.isPending}
      retry={() => {
        void guide.refetch();
      }}
      reset={reset}
    />
  );
};
