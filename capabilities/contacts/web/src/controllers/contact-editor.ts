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
          action: contact ? "update" : "create",
        });
        if (result.status !== "ok") {
          failure = t(
            result.status === "not_found"
              ? "missingContact"
              : result.status === "signed_out"
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
  const missing = Boolean(contact && !current);

  const [value, setValue] = useState<ContactDetails>(
    savedDraft?.value ?? {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      affiliation: contact?.affiliation ?? "",
    },
  );

  const clear = () => draftStore.set(workspaceSlug, contact?.id, undefined);

  return {
    missing,
    value,
    change: (next: ContactDetails) => {
      setValue(next);
      const unchanged =
        next.name === (contact?.name ?? "") &&
        next.email === (contact?.email ?? "") &&
        next.affiliation === (contact?.affiliation ?? "");
      draftStore.set(workspaceSlug, contact?.id, unchanged ? undefined : { id, value: next });
    },
    id,
    clear,
  };
};
