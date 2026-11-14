import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { useDrafts } from "@merit/drafts";
import type { TableSort } from "@merit/tables";
import { Notice } from "@merit/ui/notice";

export type OrganizationListView = { sorting: TableSort };

const creationSchema = z.object({
  requestId: z.string(),
  name: z.string(),
  slug: z.string(),
  email: z.string(),
});
const editingSchema = z.object({ name: z.string().optional(), email: z.string().optional() });

type CreationDraft = z.infer<typeof creationSchema>;

type OrganizationDraft = { name?: string; email?: string };

type Drafts = {
  listView: OrganizationListView;
  setListView: (view: OrganizationListView) => void;
  creationReady: boolean;
  editingReady: boolean;
  creation: CreationDraft | null;
  setCreation: (draft: CreationDraft | null) => void;
  organizations: Map<string, OrganizationDraft>;
  updateOrganization: (id: string, draft: OrganizationDraft) => void;
};

const Context = createContext<Drafts | null>(null);

/** Scope storage to the operator; examples retain drafts only in memory. */
export const AdminDrafts = ({ children, scope }: { children: ReactNode; scope?: string }) => {
  const { t } = useTranslation("administration");
  const [listView, setListView] = useState<OrganizationListView>({
    sorting: null,
  });
  const {
    drafts: creations,
    update: updateCreations,
    storageUnavailable: creationError,
    ready: creationReady,
    status: creationStatus,
  } = useDrafts(scope, "admin-creation", { version: 1, schema: creationSchema });
  const {
    drafts: edits,
    update: updateEdits,
    storageUnavailable: editingError,
    ready: editingReady,
    status: editingStatus,
  } = useDrafts(scope, "admin-edits", { version: 1, schema: editingSchema });

  const creation = creations.new ?? null;

  const setCreation = (value: CreationDraft | null) =>
    updateCreations((current) => ({ ...current, new: value ?? undefined }));

  const organizations = new Map(
    Object.entries(edits).filter((entry): entry is [string, OrganizationDraft] =>
      Boolean(entry[1]),
    ),
  );

  const updateOrganization = (id: string, draft: OrganizationDraft) => {
    updateEdits((current) => ({ ...current, [id]: { ...current[id], ...draft } }));
  };

  return (
    <Context.Provider
      value={{
        listView,
        setListView,
        creationReady,
        editingReady,
        creation,
        setCreation,
        organizations,
        updateOrganization,
      }}
    >
      {(creationError || editingError) && (
        <Notice tone="warning">
          {t(
            creationStatus === "conflict" || editingStatus === "conflict"
              ? "draftRecoveryConflict"
              : "draftStorageUnavailable",
          )}
        </Notice>
      )}
      {children}
    </Context.Provider>
  );
};

export const useAdminDrafts = () => {
  const drafts = useContext(Context);
  if (!drafts) {
    throw new Error("AdminDrafts is required");
  }
  return drafts;
};
