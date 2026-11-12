import { createContext, useContext, useState, type ReactNode } from "react";
import { z } from "zod";

import { useDrafts, type DraftStatus } from "@merit/drafts";

const contactDraft = z.object({
  id: z.string(),
  baseline: z.number().int().nonnegative().nullable(),
  value: z.object({ name: z.string(), email: z.string(), affiliation: z.string() }),
});

type Draft = z.infer<typeof contactDraft>;

type Drafts = Record<string, Draft | undefined>;

type Store = {
  unavailable: boolean;
  ready: boolean;
  status: DraftStatus;
  drafts: Drafts;
  setDraft: (key: string, value: Draft | undefined) => void;
};

const Context = createContext<Store | null>(null);

export const ContactDraftProvider = ({
  children,
  scope,
}: {
  children: ReactNode;
  scope?: string;
}) => {
  const {
    drafts,
    update,
    storageUnavailable: unavailable,
    ready,
    status,
  } = useDrafts(scope, "contacts", { version: 1, schema: contactDraft });

  return (
    <Context
      value={{
        unavailable,
        ready,
        status,
        drafts,
        setDraft: (key, value) => update((current) => ({ ...current, [key]: value })),
      }}
    >
      {children}
    </Context>
  );
};

/** Standalone examples retain drafts locally; workspace composition shares the account-scoped store. */
export const useContactDrafts = () => {
  const shared = useContext(Context);
  const [drafts, update] = useState<Drafts>({});
  const store = shared ?? {
    unavailable: false,
    ready: true,
    status: "memory" as const,
    drafts,
    setDraft: (key: string, value: Draft | undefined) =>
      update((current) => ({ ...current, [key]: value })),
  };

  const key = (workspaceSlug: string, contactId?: string) =>
    `${workspaceSlug}/${contactId ?? "new"}`;

  return {
    unavailable: store.unavailable,
    ready: store.ready,
    status: store.status,
    get: (workspaceSlug: string, contactId?: string) => store.drafts[key(workspaceSlug, contactId)],
    has: (workspaceSlug: string, contactId?: string) =>
      Boolean(store.drafts[key(workspaceSlug, contactId)]),
    set: (workspaceSlug: string, contactId: string | undefined, value: Draft | undefined) =>
      store.setDraft(key(workspaceSlug, contactId), value),
  };
};
