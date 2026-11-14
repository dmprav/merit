import type { ReactNode } from "react";

import { DraftContext, useIntakeDraftStore } from "../controllers/intake/drafts";

export { Messages as GrantmakingMessagesProvider } from "../messages";

export const GrantmakingDrafts = ({
  children,
  storageScope,
}: {
  children: ReactNode;
  storageScope?: string;
}) => {
  const store = useIntakeDraftStore(storageScope);
  return <DraftContext value={store.value}>{store.ready ? children : null}</DraftContext>;
};
