import { useSuspenseInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { AccessRequest } from "@merit/organizations/api";
import { Button } from "@merit/ui/button";
import { Notice } from "@merit/ui/notice";

import { AdminPageState } from "../../shared/admin-page-state";
import type { AccessRequestsResult } from "./contracts";
import { useAccessRequestsData } from "./data/access-requests";
import { accessRequestsOptions } from "./data/queries";
import { AccessRequestsView } from "./views/access-requests-view";

export const AccessRequests = ({
  initialData,
}: {
  initialData?: InfiniteData<AccessRequestsResult, null>;
}) => {
  const { t } = useTranslation("administration");
  const query = useSuspenseInfiniteQuery({ ...accessRequestsOptions(), initialData });
  const data = useAccessRequestsData();
  const requests = new Map<string, AccessRequest>();
  for (const page of query.data.pages) {
    if (page.status !== "ok") {
      return <AdminPageState status={page.status} returnTo="/admin/access-requests" />;
    }
    for (const request of page.value.requests) {
      // Another operator can move a previously loaded row into the reviewed group.
      requests.delete(request.email);
      requests.set(request.email, request);
    }
  }
  return (
    <>
      <AccessRequestsView requests={[...requests.values()]} data={data} />
      {query.isFetchNextPageError && (
        <Notice tone="danger" appearance="inline" role="alert">
          {t("requests.loadError")}
        </Notice>
      )}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          isPending={query.isFetchingNextPage}
          isDisabled={query.isFetching || data.reviewing || data.refreshFailed}
          onPress={() => void query.fetchNextPage()}
        >
          {t("requests.loadMore")}
        </Button>
      )}
    </>
  );
};
