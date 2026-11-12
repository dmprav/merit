import { useEffect, useRef, useState } from "react";

import type { DemoState, StartDemo } from "../contracts";

export const useDemoEntry = (
  initial: DemoState,
  startDemo: StartDemo,
  onEnter: (state: Extract<DemoState, { status: "ready" }>, guided: boolean) => void,
  guided = false,
) => {
  const [state, setState] = useState(initial);
  const [pending, setPending] = useState(initial.status === "ready");
  const entered = useRef(false);
  const selectedGuidance = useRef(guided);

  const start = async (fresh: boolean, guided?: boolean) => {
    const guidance = guided ?? selectedGuidance.current;
    selectedGuidance.current = guidance;
    setPending(true);

    try {
      const result = await startDemo({ fresh });
      if (result.status === "ready") {
        onEnter(result, guidance);
      } else {
        setState(result);
        setPending(false);
      }
    } catch {
      setState({ status: "unavailable" });
      setPending(false);
    }
  };

  useEffect(() => {
    if (entered.current) {
      return;
    }

    entered.current = true;
    if (initial.status === "ready") {
      onEnter(initial, selectedGuidance.current);
    }
  }, [initial, onEnter]);

  return { state, pending, start };
};
