import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { Attribution } from "@merit/ui/attribution";
import { Reading, Stack } from "@merit/ui/layout";
import { PanelSection } from "@merit/ui/panel-section";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";

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
  useIntakeRefreshToast,
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
  useIntakeRefreshToast(intakeEditing);
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

  // Return focus to the closed section's trigger once React has committed it. An editor that
  // saved closes after an await, so a frame requested at close time can still find the editor.
  const restoreSection = useRef<IntakeSection | null>(null);
  const editingSection = intakeEditing?.section;
  useEffect(() => {
    if (!restoreSection.current || editingSection) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const previous = restoreSection.current;
      restoreSection.current = null;
      if (previous === "title") {
        intakeTitle.current?.focus();
      } else if (previous) {
        intakeTriggers.current[previous]?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  const closeIntake = () => {
    restoreSection.current = intakeEditing?.section ?? null;
    intakeEditing?.close();
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
    <PanelSection
      title={t("workspace.details")}
      actions={
        intakeEditing && (
          <IntakeSectionEditButton
            intake={intakeEditing}
            hasSummary={Boolean(application.summary)}
            section="metadata"
            triggerRef={triggerRef}
          />
        )
      }
    >
      {intakeEditing?.section === "metadata" ? (
        <IntakeForm editor={intakeEditing.editor} onClose={onClose} />
      ) : (
        <ApplicationDetails application={application} />
      )}
    </PanelSection>
  );
};

const StaffSummary = ({ application, intakeEditing, onClose, triggerRef }: SectionProps) => {
  const { t } = useTranslation("applicationIntake");

  return intakeEditing?.section === "details" ? (
    <section aria-label={t("intake.staffSummary")}>
      <IntakeForm editor={intakeEditing.editor} onClose={onClose} />
    </section>
  ) : application.summary ? (
    <PanelSection
      title={t("intake.staffSummary")}
      actions={
        intakeEditing && (
          <IntakeSectionEditButton
            intake={intakeEditing}
            hasSummary
            section="details"
            triggerRef={triggerRef}
          />
        )
      }
    >
      <Stack gap={3}>
        <Reading as="p" prose={false}>
          {application.summary}
        </Reading>
        {application.summaryAuthor && <Attribution actor={application.summaryAuthor.name} />}
      </Stack>
    </PanelSection>
  ) : (
    intakeEditing && (
      <IntakeSectionEditButton
        intake={intakeEditing}
        hasSummary={false}
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
      <Text variant="caption">{t("workspace.version", { version: application.version })}</Text>
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
          <SectionHeader title={t("workspace.submission")} aside={actions} />
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
