import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../components/button/button";
import { Notice } from "../../components/notice/notice";
import styles from "./paged-content.module.css";

/** Initial retries lose their error flag before they have data; keep recovery visible until settled. */
export const useCollectionRecovery = (failed: boolean, fetching: boolean) => {
  const [previouslyFailed, setPreviouslyFailed] = useState(failed);
  if (failed !== previouslyFailed && (failed || !fetching)) {
    setPreviouslyFailed(failed);
  }
  return failed || (previouslyFailed && fetching);
};

/** Place beside the page controls so recovery stays where the request started. */
export const CollectionRecovery = ({
  message,
  retryLabel,
  onRetry,
  isPending = false,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => unknown;
  isPending?: boolean;
}) => (
  <Notice
    className={styles.recovery}
    tone="danger"
    role={isPending ? "status" : "alert"}
    actions={
      onRetry && (
        <Button
          variant="secondary"
          size="small"
          isPending={isPending}
          onPress={() => void onRetry()}
        >
          {retryLabel}
        </Button>
      )
    }
  >
    {message}
  </Notice>
);

export type PagedContentState<T> = {
  entries: T[];
  loaded?: boolean;
  denied?: boolean;
  pending?: boolean;
  fetching?: boolean;
  failed?: boolean;
  hasMore?: boolean;
  more?: () => unknown;
  retry?: () => unknown;
};

type Props<T> = PagedContentState<T> & {
  /** Override history copy when paging another collection. */
  labels?: Partial<Record<"loading" | "failed" | "unavailable" | "more" | "retry", string>>;
  children: (entries: T[], hasMore: boolean) => ReactNode;
};

/** Static examples and authorized remote pages share the same presentation. */
export const PagedContent = <T,>({
  entries,
  loaded = true,
  denied = false,
  pending = false,
  fetching = false,
  failed = false,
  hasMore = false,
  more,
  retry,
  children,
  labels = {},
}: Props<T>) => {
  const { t } = useTranslation("common");
  const recovering = useCollectionRecovery(failed, fetching);
  const {
    loading = t("pagedLoading"),
    unavailable = t("pagedUnavailable"),
    failed: failureMessage = t("pagedFailed"),
    retry: retryLabel = t("pagedRetry"),
    more: moreLabel = t("pagedMore"),
  } = labels;
  if (denied) {
    return <Notice tone="neutral">{unavailable}</Notice>;
  }
  return (
    <>
      {pending && !recovering && <p role="status">{loading}</p>}
      {loaded && children(entries, hasMore)}
      {recovering && (
        <CollectionRecovery
          message={fetching ? loading : failureMessage}
          retryLabel={retryLabel}
          isPending={fetching}
          onRetry={retry}
        />
      )}
      {hasMore && !recovering && (
        <Button variant="quiet" isPending={fetching} onPress={() => void more?.()}>
          {moreLabel}
        </Button>
      )}
    </>
  );
};
