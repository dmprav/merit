import { useRef } from "react";

import type { PreparationSection } from "../../controllers/preparation/preparation-state";
import { useRoundPreparation } from "../../controllers/preparation/use-round-preparation";

/** The workflow requests restoration; the rendered editor owns its focus targets. */
export const usePreparationEditing = (
  input: Omit<Parameters<typeof useRoundPreparation>[0], "onRestoreFocus">,
) => {
  const editTriggers = useRef<Partial<Record<PreparationSection, HTMLButtonElement | null>>>({});
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const controller = useRoundPreparation({
    ...input,
    onRestoreFocus: (section) => {
      requestAnimationFrame(() => {
        (section ? editTriggers.current[section] : menuTrigger.current)?.focus();
      });
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
