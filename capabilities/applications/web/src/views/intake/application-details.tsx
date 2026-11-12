import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { PersonIdentity } from "@merit/ui/person-identity";

import styles from "./application-details.module.css";

type Props = {
  application: Application;
  contact?: ReactNode;
  fields?: {
    applicant: ReactNode;
    requested: ReactNode;
    contact: ReactNode;
    projectPeriod: ReactNode;
  };
};

export const ApplicationDetails = ({ application, contact, fields }: Props) => {
  const { t } = useTranslation("applicationIntake");
  const { money, calendarDate } = useFormat();
  const submission = application.submission;

  return (
    <dl className={styles.facts} data-editing={Boolean(fields) || undefined}>
      <ApplicantDetails submission={submission} contact={contact} fields={fields} />
      <div>
        <dt>{t("intake.requested")}</dt>
        <dd data-editing={Boolean(fields) || undefined}>
          {fields?.requested ?? money(application.requested)}
        </dd>
      </div>
      {(fields || submission?.projectPeriod) && (
        <div>
          <dt>{t("evidence.projectPeriod")}</dt>
          <dd data-editing={Boolean(fields) || undefined}>
            {fields?.projectPeriod ?? submission?.projectPeriod}
          </dd>
        </div>
      )}
      {submission?.submittedOn && (
        <div>
          <dt>{t("evidence.submittedOn")}</dt>
          <dd>{calendarDate(submission.submittedOn)}</dd>
        </div>
      )}
    </dl>
  );
};

const ApplicantDetails = ({
  submission,
  contact,
  fields,
}: Pick<Props, "contact" | "fields"> & { submission: Application["submission"] }) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);

  return (
    <>
      {(fields || submission?.organization) && (
        <div>
          <dt>{t("intake.applicant")}</dt>
          <dd data-editing={Boolean(fields) || undefined}>
            {fields?.applicant ?? submission?.organization}
          </dd>
        </div>
      )}
      {(fields || contact || submission?.contact) && (
        <div>
          <dt>{t("intake.contact")}</dt>
          <dd className={styles.contactValue}>
            {fields?.contact ??
              contact ??
              (submission?.contact ? (
                <PersonIdentity name={submission.contact} />
              ) : (
                t("contacts:noContact")
              ))}
          </dd>
        </div>
      )}
      {!fields && submission?.contactEmail && (
        <div>
          <dt>{t("intake.contactEmail")}</dt>
          <dd>{submission.contactEmail}</dd>
        </div>
      )}
    </>
  );
};
