import { useRef, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { Inline, Reading } from "@merit/ui/layout";

import type { IntakeData } from "../../contracts/intake";
import type { IntakeSection } from "../../controllers/intake/intake-state";
import {
  useApplicationIntake,
  type ApplicationIntakeController,
} from "../../controllers/intake/use-application-intake";
import { ApplicationContact } from "./application-contact";
import { ApplicationDetails } from "./application-details";
import {
  IntakeControls,
  IntakeSectionEditButton,
  IntakeFeedback,
  IntakeRefreshFeedback,
  IntakeTitle,
  WithdrawalStatus,
  intakeMenuItems,
} from "./application-intake";
import styles from "./intake-content.module.css";
import { IntakeForm } from "./intake-form";
import { SubmissionAnswers } from "./submission-answers";

export type IntakeSession = { data: IntakeData; onDeleted: () => Promise<void> };

type IntakeContent = {
  title: ReactNode;
  overview: ReactNode;
  evidence: ReactNode;
  details: ReactNode;
  feedback: ReactNode;
  notice: ReactNode;
  menu: {
    items: { id: string; label: string }[];
    disabled: boolean;
    onAction: (action: string) => void;
  };
};

type Props = {
  application: Application;
  session?: IntakeSession;
  onReveal: () => void;
  children: (content: IntakeContent) => ReactNode;
};

/** Owns intake editing and presentation; the workspace only arranges its content. */
export const ApplicationIntake = (props: Props) =>
  props.session ? (
    <EditableIntake {...props} session={props.session} />
  ) : (
    <IntakePresentation {...props} />
  );

const EditableIntake = (props: Props & { session: IntakeSession }) => {
  const intakeEditing = useApplicationIntake({ application: props.application, ...props.session });
  return <IntakePresentation {...props} intakeEditing={intakeEditing} />;
};

const IntakePresentation = ({
  application,
  onReveal: revealIntake,
  children,
  intakeEditing,
}: Props & { intakeEditing?: ApplicationIntakeController }) => {
  const { t } = useTranslation("applicationIntake");
  const intakeTitle = useRef<HTMLSpanElement>(null);
  const intakeTriggers = useRef<Partial<Record<IntakeSection, HTMLButtonElement | null>>>({});

  const closeIntake = () => {
    const previous = intakeEditing?.section;
    intakeEditing?.close();
    requestAnimationFrame(() => {
      if (previous === "title") {
        intakeTitle.current?.focus();
      } else if (previous) {
        intakeTriggers.current[previous]?.focus();
      }
    });
  };

  const overview = (
    <>
      <IntakeMetadata
        application={application}
        intakeEditing={intakeEditing}
        onClose={closeIntake}
        triggerRef={(element) => {
          intakeTriggers.current.metadata = element;
        }}
      />
      <StaffSummary
        application={application}
        intakeEditing={intakeEditing}
        onClose={closeIntake}
        triggerRef={(element) => {
          intakeTriggers.current.details = element;
        }}
      />
    </>
  );
  const evidence = (
    <ApplicantSubmission
      application={application}
      intakeEditing={intakeEditing}
      onClose={closeIntake}
      onReveal={revealIntake}
      triggerRef={(element) => {
        intakeTriggers.current.content = element;
      }}
    />
  );

  return children({
    title: intakeEditing ? (
      <IntakeTitle intake={intakeEditing} titleRef={intakeTitle} onReveal={revealIntake} />
    ) : (
      application.title
    ),
    overview,
    evidence,
    details: (
      <div className={styles.document}>
        <ApplicationDetails application={application} />
      </div>
    ),
    feedback: intakeEditing && <IntakeFeedback intake={intakeEditing} />,
    notice: intakeEditing?.refreshError && <IntakeRefreshFeedback intake={intakeEditing} />,
    menu: {
      items: intakeEditing ? intakeMenuItems(intakeEditing.menuActions, t) : [],
      disabled: Boolean(intakeEditing?.pending),
      onAction: (action) => intakeAction(intakeEditing, revealIntake, action),
    },
  });
};

type SectionProps = {
  application: Application;
  intakeEditing?: ApplicationIntakeController;
  onClose: () => void;
  triggerRef: Ref<HTMLButtonElement>;
};

const IntakeMetadata = ({ application, intakeEditing, onClose, triggerRef }: SectionProps) => {
  const { t } = useTranslation("applicationIntake");
  const mode = intakeEditing?.metadataEditing;
  const contact = mode?.kind === "contact" ? mode : null;

  return contact ? (
    <ApplicationContact
      key={contact.publicId}
      application={application}
      data={contact.data}
      revision={contact.revision}
      isDisabled={Boolean(intakeEditing?.pending)}
    />
  ) : (
    <section>
      <Inline justify="between" className={styles.sectionHeading}>
        <h2>{t("workspace.details")}</h2>
        {intakeEditing && (
          <IntakeSectionEditButton
            intake={intakeEditing}
            hasSummary={Boolean(application.summary)}
            section="metadata"
            triggerRef={triggerRef}
          />
        )}
      </Inline>
      {intakeEditing?.section === "metadata" ? (
        <IntakeForm editor={intakeEditing.editor} onClose={onClose} />
      ) : (
        <ApplicationDetails application={application} />
      )}
    </section>
  );
};

const StaffSummary = ({ application, intakeEditing, onClose, triggerRef }: SectionProps) => {
  const { t } = useTranslation("applicationIntake");

  return application.summary || intakeEditing?.section === "details" ? (
    <section className={styles.summary} aria-label={t("intake.staffSummary")}>
      {intakeEditing?.section === "details" ? (
        <IntakeForm editor={intakeEditing.editor} onClose={onClose} />
      ) : (
        <>
          <Inline justify="between" className={styles.sectionHeading}>
            <h2>{t("intake.staffSummary")}</h2>
            {intakeEditing && (
              <IntakeSectionEditButton
                intake={intakeEditing}
                hasSummary={Boolean(application.summary)}
                section="details"
                triggerRef={triggerRef}
              />
            )}
          </Inline>
          <Reading as="p" className={styles.prose}>
            {application.summary}
          </Reading>
          {application.summaryAuthor && (
            <p className={styles.meta}>{application.summaryAuthor.name}</p>
          )}
        </>
      )}
    </section>
  ) : (
    intakeEditing && (
      <IntakeSectionEditButton
        intake={intakeEditing}
        hasSummary={Boolean(application.summary)}
        section="details"
        triggerRef={triggerRef}
      />
    )
  );
};

const ApplicantSubmission = ({
  application,
  intakeEditing,
  onClose,
  onReveal,
  triggerRef,
}: SectionProps & { onReveal: () => void }) => {
  const { t } = useTranslation("applicationIntake");
  const submission = application.submission;

  const actions = (
    <div className={styles.submissionActions}>
      <span className={styles.meta}>
        {t("workspace.version", { version: application.version })}
      </span>
      {intakeEditing && (
        <IntakeSectionEditButton
          intake={intakeEditing}
          hasSummary={Boolean(application.summary)}
          section="content"
          triggerRef={triggerRef}
          onReveal={onReveal}
        />
      )}
    </div>
  );

  return (
    <div className={styles.document}>
      {intakeEditing ? (
        <IntakeControls intake={intakeEditing} headingActions={actions} />
      ) : (
        <>
          <Inline justify="between" className={styles.sectionHeading}>
            <h2>{t("workspace.submission")}</h2>
            {actions}
          </Inline>
          {application.withdrawal && <WithdrawalStatus application={application} />}
        </>
      )}
      {intakeEditing?.section === "title" && (
        <IntakeForm editor={intakeEditing.editor} onClose={onClose} />
      )}
      {intakeEditing?.section === "content" ? (
        <IntakeForm editor={intakeEditing.editor} onClose={onClose} />
      ) : submission ? (
        <SubmissionAnswers answers={submission.answers} />
      ) : (
        <p>{t("evidence.unavailable")}</p>
      )}
    </div>
  );
};

const intakeAction = (
  intakeEditing: ApplicationIntakeController | undefined,
  revealIntake: () => void,
  action: string,
) => {
  if (!intakeEditing) {
    return;
  }

  if (action === "title") {
    intakeEditing.open("title");
    revealIntake();
  } else if (action === "start_revision" || action === "correct") {
    revealIntake();
    void (action === "correct" ? intakeEditing.startCorrection() : intakeEditing.startRevision());
  } else if (action === "delete" || action === "discard_revision" || action === "withdraw") {
    intakeEditing.setConfirmation(action);
  }
};
