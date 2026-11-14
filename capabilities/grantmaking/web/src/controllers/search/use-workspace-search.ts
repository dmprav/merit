import { useEffect, useRef, useState } from "react";

import type { WorkspaceSearchData } from "../../contracts/search";

/** How long typing must pause before the text is sent. */
const searchDelayMs = 150;

/**
 * One search session: the typed text, a query that settles once typing pauses, and the results
 * it returns. Typed text is page state, so it never reaches a URL or history. Mount the session
 * each time the box opens so it starts empty.
 */
export const useWorkspaceSearch = (data: WorkspaceSearchData) => {
  const [typed, setTyped] = useState("");
  const [settled, setSettled] = useState("");
  const text = typed.trim();
  const read = data.useResults(settled);

  // A newer query replaces the settled one after typing pauses, which cancels the older request.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (next: string) => {
    clearTimeout(timer.current);
    setTyped(next);
    const nextText = next.trim();
    if (nextText === "") {
      // Nothing to search for: show guidance at once and send nothing.
      setSettled("");
      return;
    }
    timer.current = setTimeout(() => setSettled(nextText), searchDelayMs);
  };

  if (text === "") {
    return { typed, onChange, status: "empty" } as const;
  }
  if (read.failed) {
    return { typed, onChange, status: "failed", retry: read.retry } as const;
  }
  if (!read.results) {
    return { typed, onChange, status: "waiting" } as const;
  }
  return {
    typed,
    onChange,
    status: "results",
    search: read.results,
    query: read.answered ?? settled,
    // The shown results answer an earlier query, or the typed text is still being sent.
    busy: read.fetching || text !== settled,
    updatedAt: read.updatedAt,
  } as const;
};
