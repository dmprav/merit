import { useTranslation } from "react-i18next";

import { useLocaleSettings } from "@merit/i18n";
import type { ReviewState } from "@merit/reviews/domain";
import { ActionProvenance } from "@merit/ui/action-provenance";

import styles from "./review-work.module.css";

type Request = ReviewState["requests"][number];

const RequestEvent = ({
  label,
  actor,
}: {
  label: string;
  actor: NonNullable<Request["recorder"]>;
}) => {
  const { formatLocale } = useLocaleSettings();
  return (
    <p className={styles.requestEvent}>
      <span>{label}</span>
      <time dateTime={actor.recordedAt} title={actor.recordedAt}>
        {new Date(actor.recordedAt).toLocaleString(formatLocale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
        })}{" "}
        UTC
      </time>
      <ActionProvenance value={actor.provenance} />
    </p>
  );
};

/** Request basis and audit events are kept together in both list and selected views. */
export const RequestDetails = ({ request }: { request: Request }) => {
  const { t } = useTranslation("reviews");

  return (
    <div className={styles.requestDetails}>
      <p>
        {request.applicationVersion === null
          ? t("requestSubmissionUnknown")
          : t("requestSubmission", { version: request.applicationVersion })}
        {" · "}
        {request.criteriaVersion === null
          ? t("requestCriteriaUnknown")
          : t("requestCriteria", { version: request.criteriaVersion })}
      </p>
      {request.recorder ? (
        <RequestEvent
          label={t("requestAdded", { name: request.recorder.name })}
          actor={request.recorder}
        />
      ) : (
        <p>{t("recorderUnknown")}</p>
      )}
      {request.closedBy && (
        <RequestEvent
          label={t("requestClosed", {
            status: t(request.status === "received" ? "received" : "cancelled"),
            name: request.closedBy.name,
          })}
          actor={request.closedBy}
        />
      )}
    </div>
  );
};
