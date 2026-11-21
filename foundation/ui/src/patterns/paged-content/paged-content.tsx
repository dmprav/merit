import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../components/button/button";
import { Notice } from "../../components/notice/notice";
import { useToastWhile } from "../toast/toast";
import styles from "./paged-content.module.css";

/** Initial retries lose their error flag before they have data; keep recovery visible until settled. */
export const useCollectionRecovery = (failed: boolean, fetching: boolean) => {
  const [previouslyFailed, setPreviouslyFailed] = useState(failed);
  if (failed !== previouslyFailed && (failed || !fetching)) {
    setPreviouslyFailed(failed);
  }
  return failed || (previouslyFailed && fetching);
};

/**
 * Recovers a collection read. While earlier entries stay on screen, a failed page is a toast
 * with Retry, the entries remain usable, and a retry in progress shows as a status line. When
 * nothing could be shown, place it beside the page controls so recovery stays where the request
 * started.
 */
export const CollectionRecovery = ({
  message,
  retryLabel,
  onRetry,
  isPending = false,
  showsEntries = false,
}: {
  message: string;
  retryLabel: string;
  onRetry?: () => unknown;
  isPending?: boolean;
  showsEntries?: boolean;
}) => {
  useToastWhile(
    showsEntries && !isPending
      ? {
          tone: "danger",
          message,
          action: onRetry && { label: retryLabel, onPress: () => void onRetry() },
        }
      : null,
  );

  if (showsEntries) {
    return isPending ? <p role="status">{message}</p> : null;
  }

  return (
    <div className={styles.recovery}>
      <Notice
        tone="danger"
        role={isPending ? "status" : "alert"}
        actions={
          onRetry && (
            <Button variant="secondary" isPending={isPending} onPress={() => void onRetry()}>
              {retryLabel}
            </Button>
          )
        }
      >
        {message}
      </Notice>
    </div>
  );
};

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
          showsEntries={loaded && entries.length > 0}
        />
      )}
      {hasMore && !recovering && (
        <Button size="medium" variant="quiet" isPending={fetching} onPress={() => void more?.()}>
          {moreLabel}
        </Button>
      )}
    </>
  );
};
