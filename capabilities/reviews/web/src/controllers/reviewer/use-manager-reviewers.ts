import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";

import { useWorkflowRefresh } from "@merit/query/refresh";
import type { ReviewerSummary, ReviewerEvent } from "@merit/reviews/api";

import type { ManagerReviewerData } from "../../contracts/reviewer";

type Assignments = (ReviewerSummary & { history?: ReviewerEvent[] })[];

type ManagerFailure = Exclude<Awaited<ReturnType<ManagerReviewerData["invite"]>>, { status: "ok" }>;

export const useManagerReviewers = (
  data: ManagerReviewerData | undefined,
  reviewRevision: number,
) => {
  const [failure, setFailure] = useState<ManagerFailure | null>(null);
  const [pending, setPending] = useState(false);
  const receipt = useRef<{ key: string; id: string } | null>(null);
  const records = useReviewerAssignments(data, reviewRevision);

  const command = async (
    key: string,
    operation: (id: string) => ReturnType<ManagerReviewerData["invite"]>,
  ) => {
    if (!data || pending || records.refreshing) {
      return false;
    }
    const id = receipt.current?.key === key ? receipt.current.id : crypto.randomUUID();
    receipt.current = { key, id };
    setPending(true);
    setFailure(null);
    let succeeded = false;
    try {
      const result = await operation(id);
      if (result.status !== "ok") {
        setFailure(result);
        if (result.status !== "unavailable") {
          receipt.current = null;
        }
      } else {
        receipt.current = null;
        succeeded = true;
        await records.acceptSaved(result.value);
      }
    } catch {
      setFailure({ status: "unavailable" });
    }
    setPending(false);
    return succeeded;
  };

  return data
    ? {
        historySource: data.historySource,
        assignments: records.assignments,
        failure,
        refreshError: records.refreshError,
        pending: pending || records.refreshing,
        loaded: records.loaded,
        refresh: () => {
          setFailure(null);
          return records.retry();
        },
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
      }
    : null;
};

/** Retains confirmed assignments and owns read recovery independently of command outcomes. */
const useReviewerAssignments = (data: ManagerReviewerData | undefined, reviewRevision: number) => {
  const [assignments, setAssignments] = useState<Assignments>([]);
  const [loaded, setLoaded] = useState(false);
  const savedRefreshPending = useRef(false);
  const readAssignments = useCallback(async () => {
    if (!data) {
      return;
    }
    const result = await data.read();
    if (result.status !== "ok") {
      throw new Error("Reviewer assignments could not be loaded");
    }
    setAssignments(result.value);
    setLoaded(true);
  }, [data]);
  const { refresh, refreshError, refreshing } = useWorkflowRefresh(async (context) => {
    await readAssignments();
    if (context === "saved") {
      await data?.refresh();
    }
  });

  const refreshSaved = async () => {
    savedRefreshPending.current = true;
    await refresh("saved");
    savedRefreshPending.current = false;
  };

  const retry = () => (refreshError === "saved" ? refreshSaved() : refresh("read"));

  const refreshAssignments = useEffectEvent(() => {
    // A saved refresh already reloads assignments; a partial read must not clear its outcome.
    if (!savedRefreshPending.current) {
      void retry();
    }
  });
  useEffect(() => {
    refreshAssignments();
  }, [readAssignments, reviewRevision]);

  return {
    assignments,
    loaded,
    refreshError,
    refreshing,
    retry,
    acceptSaved: async (assignment: ReviewerSummary) => {
      setAssignments((current) =>
        current.some((item) => item.id === assignment.id)
          ? current.map((item) => (item.id === assignment.id ? { ...item, ...assignment } : item))
          : [...current, assignment],
      );
      await refreshSaved();
    },
  };
};
