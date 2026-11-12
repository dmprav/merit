import { useState } from "react";

import type { Contact, ContactsData } from "../contracts";

export const useContactsDirectory = (workspaceSlug: string, data: ContactsData) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<
    Exclude<Awaited<ReturnType<ContactsData["save"]>>, { status: "ok" }>["status"] | null
  >(null);
  const [refreshError, setRefreshError] = useState<"saved" | "read" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [outstanding, setOutstanding] = useState<{ publicId: string; title: string }[]>([]);
  const [saved, setSaved] = useState(0);

  const committed = () => {
    setError(null);
    setOutstanding([]);
    setSaved((value) => value + 1);
  };

  const refresh = async (context: "saved" | "read") => {
    setRefreshing(true);
    try {
      await data.refresh();
      setRefreshError(null);
    } catch {
      setRefreshError(context);
    }
    setRefreshing(false);
  };

  const contactSaved = async () => {
    committed();
    await refresh("saved");
  };

  const changeArchived = async (contact: Contact) => {
    setError(null);
    setRefreshError(null);
    setOutstanding([]);
    setPending(true);
    let changed = false;

    try {
      const result = await data.save({
        workspaceSlug,
        contactId: contact.id,
        expectedContactRevision: contact.revision,
        action: contact.archived ? "restore" : "archive",
      });
      if (result.status === "ok") {
        changed = true;
        await contactSaved();
      } else if (result.status === "invalid" && "outstanding" in result) {
        setOutstanding(result.outstanding);
      } else {
        setError(result.status);
        if (result.status === "conflict") {
          await refresh("read");
        }
      }
    } catch {
      setError("unavailable");
    }

    setPending(false);
    return changed;
  };

  return {
    pending: pending || refreshing,
    error,
    refreshError,
    outstanding,
    saved,
    retryRefresh: () => refresh(refreshError ?? "read"),
    changeArchived,
    contactSaved,
  };
};
