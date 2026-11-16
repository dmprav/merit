import { useEffectEvent, useLayoutEffect, useRef } from "react";

import type { ReviewState } from "@merit/reviews/domain";
import { useReadingNavigation } from "@merit/ui/reference-workspace";

export type ReviewInspection =
  | { kind: "review" | "assessment" | "history"; id: string }
  | {
      kind: "criteria";
      id: string;
      version: ReviewState["assessments"][number]["versions"][number];
    }
  | { kind: "requests" };

/** Owns overview selection and nested reading visits, independent of the active writing task. */
export const useReviewReading = (selectedId?: string) => {
  const navigation = useReadingNavigation<ReviewInspection>(
    selectedId ? { kind: "review", id: selectedId } : null,
  );
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const previousSelection = useRef(selectedId);
  const receiveSelection = useEffectEvent(() => {
    if (previousSelection.current !== selectedId) {
      previousSelection.current = selectedId;
      navigation.reset(selectedId ? { kind: "review", id: selectedId } : null);
    }
  });
  useLayoutEffect(() => receiveSelection(), [selectedId]);

  const inspect = (destination: ReviewInspection) => {
    const target =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement.dataset.reviewAction
        : undefined;
    navigation.open(
      destination,
      () =>
        Array.from(
          navigation.root.current?.querySelectorAll<HTMLButtonElement>(
            "button[data-review-action]",
          ) ?? [],
        ).find((button) => button.dataset.reviewAction === target) ?? null,
    );
  };

  return {
    inspection: navigation.destination,
    previous: navigation.previous,
    root: navigation.root,
    heading: navigation.heading,
    back: navigation.back,
    inspect,
    openReview: (id: string) =>
      navigation.reset({ kind: "review", id }, () => triggers.current.get(id) ?? null),
    showAll: () => navigation.reset(),
    registerTrigger: (id: string, element: HTMLButtonElement | null) => {
      if (element) {
        triggers.current.set(id, element);
      } else {
        triggers.current.delete(id);
      }
    },
  };
};

export type ReviewReading = ReturnType<typeof useReviewReading>;
