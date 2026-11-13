import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { PageSource } from "@merit/query/contracts";
import { usePagedContent } from "@merit/query/pages";

import { Button } from "../../components/button/button";
import { Notice } from "../../components/notice/notice";

type Props<T> = {
  source?: PageSource<T>;
  entries: T[];
  active: boolean;
  children: (entries: T[], hasMore: boolean) => ReactNode;
};

/** Static examples and authorized remote pages share the same presentation. */
export const PagedContent = <T,>(props: Props<T>) =>
  props.source
    ? props.active && <RemoteContent {...props} source={props.source} />
    : props.children(props.entries, false);

const RemoteContent = <T,>({ source, children }: Props<T> & { source: PageSource<T> }) => {
  const { t } = useTranslation("common");
  const page = usePagedContent(source);
  if (page.denied) {
    return <Notice tone="neutral">{t("pagedUnavailable")}</Notice>;
  }
  return (
    <>
      {page.pending && <p role="status">{t("pagedLoading")}</p>}
      {page.loaded && children(page.entries, page.hasMore)}
      {page.failed && (
        <Notice tone="danger" role="alert">
          {t("pagedFailed")}{" "}
          <Button variant="quiet" isPending={page.fetching} onPress={() => void page.retry()}>
            {t("pagedRetry")}
          </Button>
        </Notice>
      )}
      {page.hasMore && !page.failed && (
        <Button variant="quiet" isPending={page.fetching} onPress={() => void page.more()}>
          {t("pagedMore")}
        </Button>
      )}
    </>
  );
};
