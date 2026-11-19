import { useTranslation } from "react-i18next";

import type { AccessRequest } from "@merit/organizations/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { Button } from "@merit/ui/button";
import { PickerPopover } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { Timestamp } from "@merit/ui/timestamp";

import type { AccessRequestsData } from "../contracts";
import styles from "./access-requests-view.module.css";

export const AccessRequestsView = ({
  requests,
  data,
}: {
  requests: AccessRequest[];
  data: AccessRequestsData;
}) => {
  const { t } = useTranslation(["administration", "common"]);

  const columns: TableColumn<AccessRequest>[] = [
    { id: "email", header: t("requests.email"), cell: (record) => record.email },
    {
      id: "requestedAt",
      header: t("requests.received"),
      cell: (record) => <Timestamp value={new Date(record.requestedAt).toISOString()} />,
    },
    {
      id: "reviewed",
      header: t("requests.status"),
      cell: (record) => (record.reviewedAt ? t("requests.reviewed") : t("requests.new")),
    },
    {
      id: "actions",
      header: t("requests.actions"),
      layout: { width: "10rem", align: "end", rowActions: true },
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
      <PageHeader title={t("requests.title")} actions={<RequestHelp />} />
      {data.error && (
        <Notice tone="danger" appearance="inline" role="alert">
          {t("requests.error")}
        </Notice>
      )}
      {data.refreshFailed && (
        <Notice
          appearance="inline"
          tone="warning"
          role="alert"
          actions={
            <Button
              variant="quiet"
              size="small"
              isPending={data.refreshing}
              onPress={() => void data.refresh()}
            >
              {t("requests.refresh")}
            </Button>
          }
        >
          {t("requests.refreshError")}
        </Notice>
      )}
      <DataTable
        data={requests}
        density="compact"
        columns={columns}
        getRowId={(request) => request.email}
        label={t("requests.title")}
        emptyMessage={t("requests.empty")}
      />
    </>
  );
};

const RequestHelp = () => {
  const { t } = useTranslation(["administration", "common"]);
  return (
    <PickerPopover
      title={t("requests.about")}
      placement="bottom end"
      trigger={
        <Button variant="quiet" size="small">
          <Icon name="info" />
          {t("requests.about")}
        </Button>
      }
    >
      {({ closeButton }) => (
        <div className={styles.help}>
          <div className={styles.helpHeading}>
            <h2>{t("requests.about")}</h2>
            {closeButton}
          </div>
          <p>{t("requests.description")}</p>
          <p>{t("requests.reviewExplanation")}</p>
        </div>
      )}
    </PickerPopover>
  );
};
