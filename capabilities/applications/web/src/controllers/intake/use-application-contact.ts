import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { useWorkflowRefresh } from "@merit/query/refresh";

import type { ApplicationContactData, IntakeSaveResult } from "../../contracts/intake";

const useContactSelection = (
  data: ApplicationContactData,
  contactId: string | null,
  onSelected: () => void,
) => {
  const [saved, setSaved] = useState(0);
  const [undo, setUndo] = useState<{ contactId: string | null; revision: number } | null>(null);
  const [failure, setFailure] = useState<Exclude<IntakeSaveResult, { status: "ok" }> | null>(null);
  const { refresh, refreshError, refreshing } = useWorkflowRefresh((context) =>
    context === "saved" ? data.refresh() : data.refreshCurrent(),
  );
  const busy = useRef(false);
  const mutation = useMutation({
    mutationFn: ({ contactId, revision }: { contactId: string | null; revision: number }) =>
      data.selectContact(contactId, revision),
  });

  const save = async (
    selected: string | null,
    expectedRevision: number,
    action: "select" | "undo",
  ) => {
    if (busy.current) {
      return;
    }
    if (action === "select" && selected === contactId) {
      onSelected();
      return;
    }

    busy.current = true;
    setFailure(null);

    try {
      const result = await mutation.mutateAsync({
        contactId: selected,
        revision: expectedRevision,
      });
      if (result.status !== "ok") {
        setFailure(result);
        if (result.status === "conflict") {
          await refresh("read");
        }
      } else {
        setUndo(action === "undo" ? null : { contactId, revision: result.revision });
        setSaved((value) => value + 1);
        onSelected();

        await refresh("saved");
      }
    } catch {
      setFailure({ status: "unavailable" });
    }
    busy.current = false;
  };

  return {
    busy,
    save,
    saved,
    canUndo: undo !== null,
    failure,
    clearFailure: () => setFailure(null),
    refreshError,
    pending: mutation.isPending || refreshing,
    undoSelection: async () => {
      if (undo) {
        await save(undo.contactId, undo.revision, "undo");
      }
    },
    retryRefresh: async () => {
      if (busy.current || !refreshError) {
        return;
      }
      busy.current = true;
      await refresh(refreshError);
      busy.current = false;
    },
  };
};

export const useApplicationContact = (
  data: ApplicationContactData,
  contactId: string | null,
  revision: number,
) => {
  const [open, setOpen] = useState(false);
  const [baseline, setBaseline] = useState(revision);
  const { busy, save, clearFailure, ...selection } = useContactSelection(data, contactId, () =>
    setOpen(false),
  );

  return {
    ...selection,
    open,
    changeOpen: (next: boolean) => {
      if (busy.current) {
        return;
      }
      setOpen(next);
      if (next) {
        setBaseline(revision);
        clearFailure();
      }
    },
    selectContact: (selected: string | null) => save(selected, baseline, "select"),
  };
};
