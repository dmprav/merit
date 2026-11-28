import { useRef } from "react";

import type { AiReviewEntry } from "@merit/reviews/domain";
import { useReadingNavigation } from "@merit/ui/reference-workspace";

import { useAiReview } from "../../controllers/ai-review/use-ai-review";

/** Which saved run the reference pane shows, with focus and position restored on Back. */
const useAiReviewReading = (reviews: readonly AiReviewEntry[]) => {
  const navigation = useReadingNavigation<{ id: string }>();
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const selected = reviews.find((review) => review.id === navigation.destination?.id) ?? null;

  return {
    selected,
    previous: navigation.previous,
    root: navigation.root,
    heading: navigation.heading,
    back: navigation.back,
    /** Choose a run from the overview. */
    open: (id: string) =>
      navigation.reset({ id }, () => triggers.current.get(`overview:${id}`) ?? null),
    /** Choose an earlier run from the one on screen. */
    openEarlier: (id: string) =>
      navigation.open(
        { id },
        () =>
          navigation.root.current?.querySelector<HTMLButtonElement>(
            `button[data-ai-review="${id}"]`,
          ) ?? null,
      ),
    close: () => navigation.reset(),
    registerTrigger: (id: string, element: HTMLButtonElement | null) => {
      if (element) {
        triggers.current.set(`overview:${id}`, element);
      } else {
        triggers.current.delete(`overview:${id}`);
      }
    },
  };
};

/** The AI review controller with the reading of its saved runs, for a screen that shows both. */
export const useAiReviewWork = (data: Parameters<typeof useAiReview>[0]) => {
  const work = useAiReview(data);
  const reading = useAiReviewReading(data?.reviews ?? []);
  return work && { ...work, reading };
};

export type AiReviewWork = NonNullable<ReturnType<typeof useAiReviewWork>>;
