import { useState } from "react";

import type { CreationData, CreationInput } from "../contracts";
import { useAdminDrafts } from "./drafts";

export const useOrganizationCreation = (
  data: CreationData,
  onCreated: (id: string) => Promise<void>,
) => {
  const drafts = useAdminDrafts();
  const [initial] = useState(
    () => drafts.creation ?? { requestId: crypto.randomUUID(), name: "", slug: "", email: "" },
  );
  return {
    initial,
    change: (values: CreationInput) =>
      drafts.setCreation(values.name || values.slug || values.email ? values : null),
    discard: () => drafts.setCreation(null),
    submit: async (values: CreationInput) => {
      const result = await data.create(values);
      if (result.status !== "ok") {
        return result;
      }
      drafts.setCreation(null);
      await onCreated(result.value.organizationId);
      return null;
    },
  };
};

export type CreationController = ReturnType<typeof useOrganizationCreation>;
