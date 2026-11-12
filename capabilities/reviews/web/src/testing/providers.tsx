import type { ReactNode } from "react";

import { DraftContext, useReviewDraftStore } from "../controllers/reviews/drafts";

export { Messages as GrantmakingMessagesProvider } from "../messages";

export const GrantmakingDrafts = ({
  children,
  storageScope,
}: {
  children: ReactNode;
  storageScope?: string;
}) => {
  const store = useReviewDraftStore(storageScope);
  return <DraftContext value={store.value}>{children}</DraftContext>;
};
