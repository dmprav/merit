import { useEffect, useRef, useState } from "react";

import type { PreparationSection } from "../../controllers/preparation/preparation-state";
import { useRoundPreparation } from "../../controllers/preparation/use-round-preparation";

/** The workflow requests restoration; the rendered editor owns its focus targets. */
export const usePreparationEditing = (
  input: Omit<Parameters<typeof useRoundPreparation>[0], "onRestoreFocus">,
) => {
  const editTriggers = useRef<Partial<Record<PreparationSection, HTMLButtonElement | null>>>({});
  const menuTrigger = useRef<HTMLButtonElement>(null);
  // Undefined means no request; null asks for the menu trigger.
  const restoreTarget = useRef<PreparationSection | null | undefined>(undefined);
  const [focusRequest, setFocusRequest] = useState(0);

  // Focus after React commits the request together with the state change that closed the editor
  // or ended the save, so the trigger is mounted and enabled again.
  useEffect(() => {
    if (restoreTarget.current === undefined) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const section = restoreTarget.current;
      restoreTarget.current = undefined;
      if (section !== undefined) {
        (section ? editTriggers.current[section] : menuTrigger.current)?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  const controller = useRoundPreparation({
    ...input,
    onRestoreFocus: (section) => {
      restoreTarget.current = section;
      setFocusRequest((count) => count + 1);
    },
  });

  return {
    ...controller,
    registerEditTrigger: (section: PreparationSection, element: HTMLButtonElement | null) => {
      editTriggers.current[section] = element;
    },
    registerMenuTrigger: (element: HTMLButtonElement | null) => {
      menuTrigger.current = element;
    },
  };
};

export type PreparationEditing = ReturnType<typeof usePreparationEditing>;
