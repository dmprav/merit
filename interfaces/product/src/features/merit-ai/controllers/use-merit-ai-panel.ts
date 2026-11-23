import { useMatches, useLocation } from "@tanstack/react-router";
import { useState } from "react";

import type { PanelWidthStorage } from "../contracts";

/** What the open page offers as context: its record's title and application, when it has them. */
const usePage = () => {
  const pathname = useLocation({ select: (location) => location.pathname });
  const matches = useMatches();
  const title = matches
    .toReversed()
    .map((match) => match.loaderData)
    .find(
      (data): data is { title: string } =>
        typeof data === "object" &&
        data !== null &&
        "title" in data &&
        typeof data.title === "string" &&
        data.title !== "",
    )?.title;
  const params: Record<string, string> = matches.at(-1)?.params ?? {};

  return { pathname, title, applicationRef: params["applicationRef"] };
};

/**
 * Whether the panel is open, how wide it is, and the page context attached to the next question.
 * The person's choices outlast navigation within the tab; only a new page brings the chip back.
 */
export const useMeritAiPanel = ({
  isInitiallyOpen,
  widthStorage,
}: {
  isInitiallyOpen: boolean;
  widthStorage: PanelWidthStorage;
}) => {
  const [isOpen, setOpen] = useState(isInitiallyOpen);
  const [width] = useState(widthStorage.read);
  const page = usePage();
  const [detachedFrom, setDetachedFrom] = useState<string | null>(null);
  if (detachedFrom !== null && detachedFrom !== page.pathname) {
    setDetachedFrom(null);
  }

  const attached = page.title !== undefined && detachedFrom === null;
  return {
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen((open) => !open),
    width,
    saveWidth: widthStorage.save,
    /** The title shown on the chip; none on pages without a record. */
    chipTitle: attached ? page.title : undefined,
    detach: () => setDetachedFrom(page.pathname),
    /** The application the attached page is about, if it is one. */
    attachedApplicationRef: attached ? page.applicationRef : undefined,
  };
};
