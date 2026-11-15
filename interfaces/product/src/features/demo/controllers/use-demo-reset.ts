import { useState } from "react";

import { useAnalytics } from "@merit/analytics";

import type { DemoState, StartDemo } from "../contracts";

export const useDemoReset = (
  workspaceId: string,
  startDemo: StartDemo,
  onReady: (state: Extract<DemoState, { status: "ready" }>) => void | Promise<void>,
) => {
  const analytics = useAnalytics();
  const [isOpen, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setPending(true);

    try {
      const result = await startDemo({ fresh: true, resetWorkspaceId: workspaceId });
      if (result.status === "ready") {
        analytics.track("demo_reset");
        await onReady(result);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    }

    setPending(false);
  };

  return {
    isOpen,
    setOpen,
    pending,
    failed,
    confirm,
    open: () => {
      setFailed(false);
      setOpen(true);
    },
  };
};
