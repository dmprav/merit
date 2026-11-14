import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../components/button/button";
import { Notice } from "../../components/notice/notice";

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
}: Props<T>) => {
  const { t } = useTranslation("common");
  if (denied) {
    return <Notice tone="neutral">{t("pagedUnavailable")}</Notice>;
  }
  return (
    <>
      {pending && <p role="status">{t("pagedLoading")}</p>}
      {loaded && children(entries, hasMore)}
      {failed && (
        <Notice tone="danger" role="alert">
          {t("pagedFailed")}{" "}
          <Button variant="quiet" isPending={fetching} onPress={() => void retry?.()}>
            {t("pagedRetry")}
          </Button>
        </Notice>
      )}
      {hasMore && !failed && (
        <Button variant="quiet" isPending={fetching} onPress={() => void more?.()}>
          {t("pagedMore")}
        </Button>
      )}
    </>
  );
};
