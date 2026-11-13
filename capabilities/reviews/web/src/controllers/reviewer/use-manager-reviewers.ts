import { useCallback, useEffect, useRef, useState } from "react";

import type { ReviewerSummary, ReviewerEvent } from "@merit/reviews/api";

import type { ManagerReviewerData } from "../../contracts/reviewer";

export const useManagerReviewers = (data: ManagerReviewerData, reviewRevision: number) => {
  const [assignments, setAssignments] = useState<
    (ReviewerSummary & { history?: ReviewerEvent[] })[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const receipt = useRef<{ key: string; id: string } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const result = await data.read();
      if (result.status === "ok") {
        setAssignments(result.value);
        setLoaded(true);
        return true;
      }
    } catch {
      /* Keep the last confirmed list available for retry. */
    }
    setError("unavailable");
    return false;
  }, [data]);
  useEffect(() => {
    void refresh();
  }, [refresh, reviewRevision]);

  const command = async (
    key: string,
    operation: (id: string) => ReturnType<ManagerReviewerData["invite"]>,
  ) => {
    if (pending) {
      return false;
    }
    const id = receipt.current?.key === key ? receipt.current.id : crypto.randomUUID();
    receipt.current = { key, id };
    setPending(true);
    setError(null);
    try {
      const result = await operation(id);
      if (result.status !== "ok") {
        setError(managerError(result.status));
        if (result.status !== "unavailable") {
          receipt.current = null;
        }
        return false;
      }
      receipt.current = null;
      await refresh();
      try {
        await data.refresh();
      } catch {
        setError("unavailable");
      }
      return true;
    } catch {
      setError("unavailable");
      return false;
    } finally {
      setPending(false);
    }
  };

  return {
    assignments,
    error,
    pending,
    loaded,
    refresh,
    invite: (requestId: string, due: string | null) =>
      command(`invite:${requestId}:${due}`, (id) => data.invite(requestId, due, id)),
    manage: (
      assignment: ReviewerSummary,
      action: Parameters<ManagerReviewerData["manage"]>[1],
      note = "",
    ) =>
      command(`${assignment.id}:${assignment.revision}:${action}:${note}`, (id) =>
        data.manage(assignment, action, note, id),
      ),
  };
};

const managerError = (status: string) => {
  if (status === "limited") {
    return "limited";
  }
  if (status === "invalid") {
    return "inviteInvalid";
  }
  return status === "conflict" ? "stale" : "unavailable";
};
