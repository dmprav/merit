import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { useReferenceViewport } from "@merit/ui/reference-workspace";

export type ApplicationReference = "evidence" | "reviews" | "history" | "details";

type Tab = "evidence" | "reviews";

const useReviewSelection = (editorOpen: boolean) => {
  const [selectedId, selectReview] = useState<string | null>(null);
  const selectedHeading = useRef<HTMLHeadingElement>(null);
  const reviewTriggers = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (selectedId && !editorOpen) {
      selectedHeading.current?.focus({ preventScroll: true });
    }
  }, [selectedId, editorOpen]);

  const back = () => {
    const previous = selectedId;
    selectReview(null);
    requestAnimationFrame(() => previous && reviewTriggers.current.get(previous)?.focus());
  };

  return {
    selectedId,
    selectReview,
    selectedHeading,
    back,
    registerReviewTrigger: (id: string, element: HTMLButtonElement | null) => {
      if (element) {
        reviewTriggers.current.set(id, element);
      } else {
        reviewTriggers.current.delete(id);
      }
    },
  };
};

/** Owns reference transitions and focus across the reading and working panes. */
export const useApplicationNavigation = ({
  tab,
  onTabChange,
  editorOpen,
}: {
  tab: Tab;
  onTabChange?: (tab: Tab) => void;
  editorOpen: boolean;
}) => {
  const viewport = useReferenceViewport<ApplicationReference>(tab);
  const { reference, referenceViewport, resetScroll } = viewport;

  const moveReference = (next: ApplicationReference) =>
    viewport.moveReference(next, { focusViewport: !editorOpen });

  const requestedTab = useRef<Tab | null>(null);
  const reviewSelection = useReviewSelection(editorOpen);
  const [historyFrom, setHistoryFrom] = useState<number>();
  const [historyVisit, setHistoryVisit] = useState(0);
  const referenceMenu = useRef<HTMLButtonElement>(null);
  const historyHeading = useRef<HTMLHeadingElement>(null);

  const receiveTab = useEffectEvent(() => {
    // A delayed URL acknowledgement must not replace a newer local reference choice.
    if (requestedTab.current === tab) {
      requestedTab.current = null;
    } else if (reference !== tab) {
      moveReference(tab);
    }
  });

  // Commit the external destination before the restoration frame measures its scroll range.
  useLayoutEffect(() => {
    receiveTab();
  }, [tab]);

  const changeReference = (next: ApplicationReference) => {
    moveReference(next);
    if (next === "evidence" || next === "reviews") {
      if (onTabChange && next !== tab) {
        requestedTab.current = next;
      }
      onTabChange?.(next);
    }
  };

  const revealIntake = () => {
    changeReference("evidence");
    requestAnimationFrame(() =>
      referenceViewport.current
        ?.querySelector<HTMLElement>(
          "form input:not([disabled]), form textarea:not([disabled]), form button:not([disabled])",
        )
        ?.focus(),
    );
  };

  const inspectHistory = (version?: number) => {
    setHistoryFrom(version);
    setHistoryVisit((visit) => visit + 1);
    changeReference("history");
    resetScroll("history");
    requestAnimationFrame(() =>
      (editorOpen ? referenceMenu.current : historyHeading.current)?.focus({ preventScroll: true }),
    );
  };

  return {
    ...reviewSelection,
    reference,
    historyFrom,
    historyVisit,
    referenceViewport,
    referenceMenu,
    historyHeading,
    changeReference,
    revealIntake,
    inspectHistory,
  };
};
