import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { contactDetailsSchema, type ContactDetails } from "@merit/contacts/domain";

import type { Contact, ContactsData } from "../contracts";
import type { useContactDrafts } from "./drafts";

type UseContactEditorOptions = {
  workspaceSlug: string;
  contact?: Contact;
  data: ContactsData;
  onSaved: (contact: Contact) => void;
  onClose: () => void;
  onPending: (pending: boolean) => void;
  draftStore: ReturnType<typeof useContactDrafts>;
};

export const useContactEditor = ({
  workspaceSlug,
  contact,
  data,
  onSaved,
  onClose,
  onPending,
  draftStore,
}: UseContactEditorOptions) => {
  const { t } = useTranslation("contacts");
  const [pending, setPending] = useState(false);
  const { id, clear, ...editing } = useContactDraft({ workspaceSlug, contact, data, draftStore });

  useEffect(() => {
    onPending(pending);
    return () => onPending(false);
  }, [pending, onPending]);

  return {
    ...editing,
    discard: () => {
      clear();
      onClose();
    },
    save: async (details: ContactDetails) => {
      setPending(true);

      let failure: string | null = null;
      try {
        const result = await data.save({
          workspaceSlug,
          contactId: id,
          details: contactDetailsSchema.parse(details),
          ...(editing.baseline === null
            ? { action: "create" }
            : { action: "update", expectedContactRevision: editing.baseline }),
        });
        if (result.status === "conflict") {
          try {
            await data.refreshCurrent();
          } catch {
            /* Keep the known conflict when its refresh fails. */
          }
          failure = t("conflict");
        } else if (result.status !== "ok") {
          failure = t(
            result.status === "not_found" || result.status === "signed_out"
              ? "accessLost"
              : "error",
          );
        } else {
          clear();
          onSaved(result.contact);
        }
      } catch {
        failure = t("error");
      }

      setPending(false);
      return failure;
    },
  };
};

const useContactDraft = ({
  workspaceSlug,
  contact,
  data,
  draftStore,
}: Pick<UseContactEditorOptions, "workspaceSlug" | "contact" | "data" | "draftStore">) => {
  const savedDraft = draftStore.get(workspaceSlug, contact?.id);
  const [id] = useState(() => savedDraft?.id ?? contact?.id ?? crypto.randomUUID());
  const current = data.contacts.find((item) => item.id === id);
  const [baseline, setBaseline] = useState(savedDraft?.baseline ?? contact?.revision ?? null);
  const conflict = Boolean(current && current.revision !== baseline);

  const [value, setValue] = useState<ContactDetails>(
    savedDraft?.value ?? {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      affiliation: contact?.affiliation ?? "",
    },
  );

  const clear = () => draftStore.set(workspaceSlug, contact?.id, undefined);

  return {
    current,
    baseline,
    conflict,
    value,
    useSaved: () => {
      if (!current) {
        return;
      }
      setValue({ name: current.name, email: current.email, affiliation: current.affiliation });
      setBaseline(current.revision);
      clear();
    },
    keepDraft: () => {
      if (!current) {
        return;
      }
      setBaseline(current.revision);
      draftStore.set(workspaceSlug, contact?.id, { id, baseline: current.revision, value });
    },
    change: (next: ContactDetails) => {
      setValue(next);
      const unchanged =
        next.name === (contact?.name ?? "") &&
        next.email === (contact?.email ?? "") &&
        next.affiliation === (contact?.affiliation ?? "");
      draftStore.set(
        workspaceSlug,
        contact?.id,
        unchanged ? undefined : { id, baseline, value: next },
      );
    },
    id,
    clear,
  };
};
