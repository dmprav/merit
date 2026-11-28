import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { IntakeApplication } from "@merit/applications/domain";
import { useFormat } from "@merit/i18n/format";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { PersonIdentity } from "@merit/ui/person-identity";
import { CalendarDate } from "@merit/ui/timestamp";

type Props = {
  application: Pick<IntakeApplication, "requested" | "submission">;
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
  const { money } = useFormat();
  const submission = application.submission;

  return (
    <DescriptionList layout="rows">
      <ApplicantDetails submission={submission} contact={contact} fields={fields} />
      <DescriptionListItem label={t("intake.requested")}>
        {fields?.requested ?? money(application.requested)}
      </DescriptionListItem>
      {(fields || submission?.projectPeriod) && (
        <DescriptionListItem label={t("evidence.projectPeriod")}>
          {fields?.projectPeriod ?? submission?.projectPeriod}
        </DescriptionListItem>
      )}
      {submission?.submittedOn && (
        <DescriptionListItem label={t("evidence.submittedOn")}>
          <CalendarDate value={submission.submittedOn} />
        </DescriptionListItem>
      )}
    </DescriptionList>
  );
};

const ApplicantDetails = ({
  submission,
  contact,
  fields,
}: Pick<Props, "contact" | "fields"> & { submission: IntakeApplication["submission"] }) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);

  return (
    <>
      {(fields || submission?.organization) && (
        <DescriptionListItem label={t("intake.applicant")}>
          {fields?.applicant ?? submission?.organization}
        </DescriptionListItem>
      )}
      {(fields || contact || submission?.contact) && (
        <DescriptionListItem label={t("intake.contact")}>
          {fields?.contact ??
            contact ??
            (submission?.contact ? (
              <PersonIdentity name={submission.contact} />
            ) : (
              t("contacts:noContact")
            ))}
        </DescriptionListItem>
      )}
      {!fields && submission?.contactEmail && (
        <DescriptionListItem label={t("intake.contactEmail")}>
          {submission.contactEmail}
        </DescriptionListItem>
      )}
    </>
  );
};
