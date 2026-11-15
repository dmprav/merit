import { useEffect, useRef, useState } from "react";

import type { WorkspaceSearch } from "@merit/grantmaking/api";

import type { WorkspaceSearchData } from "../../contracts/search";

/** How long typing must pause before the text is sent. */
const searchDelayMs = 150;

type SearchReadState = {
  results: WorkspaceSearch | undefined;
  answered: string | undefined;
  failed: boolean;
  fetching: boolean;
  updatedAt: number;
};

const emptyReadState: SearchReadState = {
  results: undefined,
  answered: undefined,
  failed: false,
  fetching: false,
  updatedAt: 0,
};

/**
 * One search session: the typed text, a query that settles once typing pauses, and the results
 * it returns. Typed text is page state, so it never reaches a URL or history. Mount the session
 * each time the box opens so it starts empty.
 */
export const useWorkspaceSearch = (data: WorkspaceSearchData) => {
  const [typed, setTyped] = useState("");
  const [settled, setSettled] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<SearchReadState>(emptyReadState);
  const text = typed.trim();
  const scopeKey = JSON.stringify(data.scope);

  // A newer query replaces the settled one after typing pauses, which cancels the older request.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (settled === "") {
      setRead(emptyReadState);
      return;
    }

    const controller = new AbortController();
    setRead((current) => ({ ...current, failed: false, fetching: true }));

    data
      .read(settled, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }
        setRead((current) => ({
          results,
          answered: settled,
          failed: false,
          fetching: false,
          updatedAt: Math.max(Date.now(), current.updatedAt + 1),
        }));
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }
        setRead((current) => ({ ...current, failed: true, fetching: false }));
      });

    return () => controller.abort();
  }, [data, scopeKey, settled, attempt]);

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
    return {
      typed,
      onChange,
      status: "failed",
      retry: () => setAttempt((count) => count + 1),
    } as const;
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
