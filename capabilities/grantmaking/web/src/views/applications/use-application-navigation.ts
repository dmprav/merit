import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import type { PdfReference } from "@merit/applications-web/intake";
import { useReferenceViewport } from "@merit/ui/reference-workspace";

export type ApplicationReference = "evidence" | "reviews" | "history" | "details" | PdfReference;

type Tab = "evidence" | "reviews";

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

  const moveReference = useReferenceNavigation(viewport, editorOpen);

  const requestedTab = useRef<Tab | null>(null);
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

  const changeReference = (next: ApplicationReference, focus = true) => {
    moveReference(next, focus);
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

const useReferenceNavigation = (
  viewport: ReturnType<typeof useReferenceViewport<ApplicationReference>>,
  editorOpen: boolean,
) => {
  const focusFrame = useRef<number | null>(null);

  const moveReference = (next: ApplicationReference, focus = true) => {
    viewport.moveReference(next, { focusViewport: false });
    if (focusFrame.current !== null) {
      cancelAnimationFrame(focusFrame.current);
    }
    if (!editorOpen && focus) {
      focusFrame.current = requestAnimationFrame(() =>
        viewport.referenceViewport.current?.focus({ preventScroll: true }),
      );
    }
  };

  useLayoutEffect(() => {
    // Opening a task cancels reference focus queued by the preceding navigation.
    if (editorOpen && focusFrame.current !== null) {
      cancelAnimationFrame(focusFrame.current);
    }
    return () => {
      if (focusFrame.current !== null) {
        cancelAnimationFrame(focusFrame.current);
      }
    };
  }, [editorOpen]);

  return moveReference;
};
