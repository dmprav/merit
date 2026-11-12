import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import type { AccessRequest } from "@merit/organizations/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { Button } from "@merit/ui/button";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";

import type { AccessRequestsData } from "../contracts";

export const AccessRequestsView = ({
  requests,
  data,
}: {
  requests: AccessRequest[];
  data: AccessRequestsData;
}) => {
  const { t } = useTranslation("administration");
  const { formatLocale } = useLocaleSettings();

  const columns: TableColumn<AccessRequest>[] = [
    { id: "email", header: t("requests.email"), cell: (record) => record.email },
    {
      id: "requestedAt",
      header: t("requests.received"),
      cell: (record) => (
        <time dateTime={new Date(record.requestedAt).toISOString()}>
          {new Date(record.requestedAt).toLocaleString(formatLocale, { timeZone: "UTC" })} UTC
        </time>
      ),
    },
    {
      id: "reviewed",
      header: t("requests.status"),
      cell: (record) => (record.reviewedAt ? t("requests.reviewed") : t("requests.new")),
    },
    {
      id: "actions",
      header: t("requests.actions"),
      cell: (record) =>
        !record.reviewedAt && (
          <Button
            size="small"
            variant="quiet"
            isDisabled={data.reviewing || data.refreshFailed}
            onPress={() => data.review(record.email)}
          >
            {t("requests.markReviewed")}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader title={t("requests.title")} description={t("requests.description")} />
      {data.error && (
        <Notice tone="danger" role="alert">
          {t("requests.error")}
        </Notice>
      )}
      {data.refreshFailed && (
        <Notice as="div" tone="warning" role="alert">
          <p>{t("requests.refreshError")}</p>
          <Button variant="secondary" onPress={() => void data.refresh()}>
            {t("requests.refresh")}
          </Button>
        </Notice>
      )}
      <DataTable
        data={requests}
        columns={columns}
        getRowId={(request) => request.email}
        label={t("requests.title")}
        emptyMessage={t("requests.empty")}
      />
    </>
  );
};
