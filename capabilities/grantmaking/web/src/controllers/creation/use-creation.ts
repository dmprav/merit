import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { CreationData, CreationDraft } from "../../contracts/creation";
import { useCreationDrafts } from "./drafts";

const emptyDraft = (): CreationDraft => ({
  requestId: crypto.randomUUID(),
  title: "",
  body: "",
  amount: "",
  meetingDate: "",
  applicant: "",
});

const hasInput = (draft: CreationDraft) =>
  [draft.title, draft.body, draft.amount, draft.meetingDate, draft.applicant].some((value) =>
    value.trim(),
  );

export const useCreation = (data: CreationData) => {
  const { t } = useTranslation("fundingRounds");
  const { creations, setCreation } = useCreationDrafts();
  const { target, draftKey: key } = data;
  const draft = creations[key];
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ title: string; publicId: string } | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const mutation = useMutation({
    mutationFn: (value: CreationDraft) => data.create(value, t("intake.material")),
  });

  const refresh = async () => {
    try {
      await data.refresh();
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  };

  const save = async (value: CreationDraft) => {
    const result = await mutation.mutateAsync(value);
    if (result.status !== "ok") {
      return t(creationError(result));
    }

    // A committed creation is successful even if refreshing the list fails.
    setCreated({ title: value.title.trim(), publicId: result.publicId });
    setRefreshFailed(false);
    setOpenFailed(false);
    setCreation(key, undefined);
    setOpen(false);
    void refresh();

    try {
      await data.open({ title: value.title.trim(), publicId: result.publicId });
    } catch {
      setOpenFailed(true);
    }

    return null;
  };

  const changeOpen = (next: boolean) => {
    if (!next && draft && !hasInput(draft)) {
      setCreation(key, undefined);
    }
    setOpen(next);
  };

  return {
    draft,
    target,
    open,
    created,
    refreshFailed,
    openFailed,
    saving: mutation.isPending,
    resumable: Boolean(draft && hasInput(draft)),
    changeOpen,
    refresh,
    save,
    dismiss: () => setCreated(null),
    openEditor: () => {
      if (!draft) {
        setCreation(key, emptyDraft());
      }
      setOpen(true);
    },
    update: (value: CreationDraft) => setCreation(key, value),
    close: () => changeOpen(false),
    discard: () => {
      setCreation(key, undefined);
      setOpen(false);
    },
  };
};

const creationError = (
  result: Exclude<Awaited<ReturnType<CreationData["create"]>>, { status: "ok" }>,
) => {
  if (result.status === "not_found" || result.status === "signed_out") {
    return "preparation.accessLost";
  }
  if ("error" in result && result.error === "request_total_too_large") {
    return "intake.requestTotalTooLarge";
  }
  if ("error" in result && result.error === "round_deleted") {
    return "preparation.alreadyDeleted";
  }
  if ("error" in result && result.error === "application_deleted") {
    return "intake.deleted";
  }

  return "creation.saveError";
};
