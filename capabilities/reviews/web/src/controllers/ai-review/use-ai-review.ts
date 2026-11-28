import { useRef, useState } from "react";

import { useWorkflowRefresh } from "@merit/query/refresh";
import type { AiReviewAvailability } from "@merit/reviews/domain";

import type { AiReviewData, AiReviewRunResponse } from "../../contracts/ai-review";

/** Why the last run saved nothing. A refused run carries the reason that now applies. */
type AiReviewFailure =
  | { kind: "failed" }
  | { kind: "unconfirmed" }
  | { kind: "accessLost" }
  | { kind: "not_available"; availability: Exclude<AiReviewAvailability, "available"> };

/**
 * Owns running an AI review and reading the saved ones. The run is a single request that can take
 * minutes, so the controller keeps it pending, reports each outcome apart from the refresh that
 * follows a save, and never repeats a committed write when only the refresh is retried.
 */
export const useAiReview = (data: AiReviewData | null | undefined) => {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AiReviewFailure | null>(null);
  const [saved, setSaved] = useState(0);
  const running = useRef(false);
  // Kept after an outcome that may have saved, so sending it again cannot add a second review.
  const runId = useRef<string | null>(null);
  // What the page last said. A refusal at save time speaks for the page as it was; newer page data
  // replaces it, whether that now agrees with the refusal or not.
  const pageState = data ? `${data.availability}:${data.reviews.map(({ id }) => id).join()}` : "";
  const [seenPageState, setSeenPageState] = useState(pageState);
  if (seenPageState !== pageState) {
    setSeenPageState(pageState);
    if (failure?.kind === "not_available") {
      setFailure(null);
    }
  }
  const { refresh, refreshError, refreshing } = useWorkflowRefresh(() =>
    data ? data.refresh() : Promise.resolve(),
  );

  if (!data) {
    return null;
  }

  const refused = failure?.kind === "not_available" ? failure.availability : null;
  // A refusal at save time holds until newer page data arrives; a page that already refuses says why.
  const availability = data.availability === "available" && refused ? refused : data.availability;

  const run = async () => {
    if (running.current || availability !== "available") {
      return;
    }
    running.current = true;
    setPending(true);
    setFailure(null);
    const id = runId.current ?? crypto.randomUUID();
    runId.current = id;
    const result = await attempt(() => data.run(id));
    if (result.status !== "unavailable") {
      runId.current = null;
    }
    switch (result.status) {
      case "ok":
        setSaved((value) => value + 1);
        await refresh("saved");
        break;
      case "failed":
        setFailure({ kind: "failed" });
        break;
      case "not_available":
        setFailure({ kind: "not_available", availability: result.availability });
        await refresh("read");
        break;
      case "not_found":
      case "signed_out":
        setFailure({ kind: "accessLost" });
        break;
      case "unavailable":
        setFailure({ kind: "unconfirmed" });
        break;
    }
    running.current = false;
    setPending(false);
  };

  return {
    reviews: data.reviews,
    availability,
    provider: data.provider,
    pending: pending || refreshing,
    running: pending,
    failure,
    saved,
    refreshError,
    run,
    refresh: () => refresh(refreshError ?? "read"),
  };
};

/** A request that cannot be confirmed reads the same as an unreachable server. */
const attempt = async (
  run: () => ReturnType<AiReviewData["run"]>,
): Promise<AiReviewRunResponse> => {
  try {
    return await run();
  } catch {
    return { status: "unavailable" };
  }
};
