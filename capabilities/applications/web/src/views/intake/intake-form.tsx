import { useEffect, useRef, useState, type ReactNode, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import {
  canEditIntakeContent,
  intakeContentSchema,
  intakeDetailsSchema,
  intakeLimits,
} from "@merit/applications/domain";
import { ContactLabel, ContactPicker } from "@merit/contacts-web/contacts";
import {
  ConflictBanner,
  Form,
  FormActions,
  FormMoneyField,
  FormTextField,
  RetainedDraftNotice,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { useFormat } from "@merit/i18n/format";
import { parseMoney } from "@merit/money";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { EditorLoading, EditorClose } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { TextField } from "@merit/ui/text-field";

import type {
  IntakeDraft,
  IntakeSection,
  IntakeSnapshot,
  IntakeValues,
  SectionDraft,
} from "../../controllers/intake/intake-state";
import type { ApplicationIntakeController } from "../../controllers/intake/use-application-intake";
import { ApplicationDetails } from "./application-details";
import styles from "./intake-form.module.css";
import { intakeError } from "./messages";
import { SubmissionAnswers } from "./submission-answers";

type EditorProps = { editor: ApplicationIntakeController["editor"]; onClose: () => void };

type SectionProps<S extends IntakeSection> = EditorProps & { draft: SectionDraft<S> };

const sectionLabels = {
  title: "intake.renameRecorded",
  metadata: "intake.editMetadata",
  content: "intake.editContent",
  details: "intake.editDetails",
} as const;

const useEditorForm = <S extends IntakeSection>(
  { editor, draft, onClose }: SectionProps<S>,
  schema: z.ZodType<IntakeValues[S], IntakeValues[S]>,
) => {
  const { t } = useTranslation("applicationIntake");

  return useForm<IntakeValues[S]>({
    defaultValues: draft.value,
    schema: useTranslatedSchema(schema, (issue) => {
      if (issue.code === "custom" && issue.params?.reason === "invalid_requested_amount") {
        return t("intake.amountInvalid");
      }
      if (issue.code === "too_small" && issue.path?.[0] === "title") {
        return t("creation.titleRequired");
      }
      return undefined;
    }),
    onChange: (value) => editor.updateDraft({ ...draft, value } as IntakeDraft),
    onSubmit: async (value) => {
      const error = await editor.saveDraft({ ...draft, value } as IntakeDraft);
      if (!error) {
        onClose();
      }
      return intakeError(t, error);
    },
    submitErrorMessage: t("intake.saveError"),
  });
};

const retainedDraftText = (draft: IntakeDraft, reason: string, noContactLabel: string) => {
  const parts: string[] = [];
  switch (draft.section) {
    case "title":
      parts.push(draft.value.title);
      break;
    case "metadata": {
      const contact =
        draft.value.contactId === null
          ? noContactLabel
          : draft.value.contactId
            ? draft.value.contactId
            : undefined;
      parts.push(
        [draft.value.applicant, draft.value.requested, draft.value.projectPeriod, contact]
          .filter(Boolean)
          .join("\n"),
      );
      break;
    }
    case "content":
      parts.push(
        draft.value.answers
          .map((answer) => [answer.question, answer.response].filter(Boolean).join("\n"))
          .join("\n\n"),
      );
      break;
    case "details":
      parts.push(draft.value.summary);
      break;
    case "reason":
      break;
  }
  if (reason.trim()) {
    parts.push(reason.trim());
  }
  return parts.filter(Boolean).join("\n\n");
};

const RetainedIntakeNotice = ({
  editor,
  onClose,
}: {
  editor: EditorProps["editor"];
  onClose: () => void;
}) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);
  if (!editor.draft) {
    return null;
  }
  return (
    <RetainedDraftNotice
      title={t("intake.retainedTitle")}
      message={t("intake.revisionUnavailable")}
      textToCopy={retainedDraftText(editor.draft, editor.reason, t("contacts:noContact"))}
      isDisabled={editor.pending}
      onDiscard={() => {
        editor.discard();
        onClose();
      }}
    />
  );
};

const IntakeConflictNotice = ({ editor }: { editor: EditorProps["editor"] }) => {
  const { t } = useTranslation("applicationIntake");
  return (
    <ConflictBanner
      title={t("intake.conflictTitle")}
      message={t("intake.conflict")}
      keepMine={{ label: t("intake.keepChanges"), onPress: editor.keepMyChanges }}
      useSaved={{ label: t("intake.useLatest"), onPress: editor.useLatestSavedValues }}
      isDisabled={editor.pending}
      latest={{
        toggleLabel: t("intake.viewLatest"),
        hideLabel: t("intake.hideLatest"),
        heading: t("intake.latest"),
        children: <LatestValues editor={editor} />,
      }}
    />
  );
};

const EditorFrame = ({
  editor,
  onClose,
  submission,
  children,
  disabled = false,
}: EditorProps & {
  submission: ComponentProps<typeof Form>["submission"];
  children: ReactNode;
  disabled?: boolean;
}) => {
  const { t } = useTranslation("applicationIntake");
  const { section, conflict, draft } = editor;
  const isRevision = Boolean(editor.workingRevision) && section !== "details";
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = frameRef.current;
    if (!element || !conflict) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !editor.pending) {
        event.preventDefault();
        onClose();
      }
    };

    element.addEventListener("keydown", handleKeyDown);
    return () => element.removeEventListener("keydown", handleKeyDown);
  }, [conflict, editor.pending, onClose]);

  if (
    draft &&
    section &&
    section !== "details" &&
    !canEditIntakeContent(editor.application, editor.workingRevision)
  ) {
    return <RetainedIntakeNotice editor={editor} onClose={onClose} />;
  }

  return (
    <div ref={frameRef}>
      <Form
        label={t(sectionLabels[section ?? "details"])}
        submission={submission}
        scrollFields={false}
        submitOnModEnter
        className={`${styles.form} ${section === "content" ? styles.longEditor : ""}`}
        actions={
          <FormActions
            submission={submission}
            discard={{
              label: t("preparation.discard"),
              onPress: () => {
                editor.discard();
                onClose();
              },
            }}
            onCancel={onClose}
            cancelLabel={t("preparation.close")}
            cancelVariant="quiet"
            submitLabel={t(isRevision ? "intake.saveWorkingRevision" : "intake.save")}
            submittingLabel={t("editor.saving")}
            isSubmitDisabled={conflict || disabled || editor.pending}
          />
        }
      >
        <div className={styles.fields}>
          {conflict && <IntakeConflictNotice editor={editor} />}
          {isRevision && (
            <p className={styles.hint}>
              {t(section === "metadata" ? "intake.workingDetailsHint" : "intake.workingDraftHint")}
            </p>
          )}
          {children}
          {isRevision && (
            <TextField
              name="reason"
              value={editor.reason}
              onChange={editor.changeReason}
              label={t("intake.reason")}
              multiline
              rows={3}
              maxLength={intakeLimits.reasonLength}
            />
          )}
        </div>
      </Form>
    </div>
  );
};

const LatestValues = ({ editor }: Pick<EditorProps, "editor">) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);
  const { section, latest } = editor;
  if (!section) {
    return null;
  }
  const { content, contactId } = latest;

  return (
    <div className={styles.latestPreview}>
      <DescriptionList>
        {section === "title" && (
          <DescriptionListItem label={t("intake.projectTitle")}>
            {content.title}
          </DescriptionListItem>
        )}
        {section === "metadata" && (
          <ConflictMetadata editor={editor} content={content} contactId={contactId} />
        )}
        {section === "details" && (
          <DescriptionListItem label={t("intake.staffSummary")}>
            {latest.summary}
          </DescriptionListItem>
        )}
        {section !== "details" && editor.workingRevision && (
          <DescriptionListItem label={t("intake.reason")}>{latest.reason}</DescriptionListItem>
        )}
      </DescriptionList>
      {section === "content" && <SubmissionAnswers answers={content.answers} headingLevel={5} />}
    </div>
  );
};

const ConflictMetadata = ({
  editor,
  content,
  contactId,
}: Pick<EditorProps, "editor"> & {
  content: IntakeSnapshot["content"];
  contactId: IntakeSnapshot["contactId"];
}) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);
  const { money } = useFormat();
  const amount = parseMoney(content.requested);
  const contact =
    contactId === editor.latest.contactId && editor.application.submission?.contact ? (
      editor.application.submission.contact
    ) : contactId ? (
      <ContactLabel
        workspaceSlug={editor.workspaceSlug}
        contactId={contactId}
        fallback={t("intake.contactNotAvailable")}
      />
    ) : (
      t("contacts:noContact")
    );

  return (
    <>
      <DescriptionListItem label={t("intake.applicant")}>
        {content.applicant || t("intake.notKnown")}
      </DescriptionListItem>
      <DescriptionListItem label={t("intake.requested")}>
        {amount.ok ? money(amount.value) : content.requested || t("intake.notKnown")}
      </DescriptionListItem>
      <DescriptionListItem label={t("intake.contact")}>{contact}</DescriptionListItem>
      <DescriptionListItem label={t("evidence.projectPeriod")}>
        {content.projectPeriod || t("intake.notKnown")}
      </DescriptionListItem>
    </>
  );
};

const TitleForm = (props: SectionProps<"title">) => {
  const { t } = useTranslation(["applicationIntake", "common", "contacts"]);
  const { form, submission } = useEditorForm(props, intakeContentSchema.pick({ title: true }));

  return (
    <EditorFrame {...props} submission={submission}>
      <form.Field name="title">
        {(field) => (
          <FormTextField
            field={field}
            label={t("intake.projectTitle")}
            isRequired
            maxLength={intakeLimits.titleLength}
            autoFocus
          />
        )}
      </form.Field>
    </EditorFrame>
  );
};

const MetadataForm = (props: SectionProps<"metadata">) => {
  const { t } = useTranslation(["applicationIntake", "common", "contacts"]);
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const application = props.editor.application;
  const workspaceSlug = props.editor.workspaceSlug;

  const { form, submission } = useEditorForm(
    props,
    intakeContentSchema.pick({ applicant: true, requested: true }).extend({
      projectPeriod: intakeContentSchema.shape.projectPeriod.unwrap(),
      contactId: z.string().nullable().optional(),
    }),
  );

  return (
    <EditorFrame {...props} submission={submission} disabled={contactEditorOpen}>
      <ApplicationDetails
        application={application}
        fields={{
          applicant: (
            <form.Field name="applicant">
              {(field) => (
                <FormTextField
                  field={field}
                  className={styles.metadataField}
                  label={t("intake.applicant")}
                  maxLength={intakeLimits.applicantLength}
                  autoFocus
                />
              )}
            </form.Field>
          ),
          contact: (
            <form.Field name="contactId">
              {(field) => (
                <div className={styles.contactField}>
                  <ContactPicker
                    workspaceSlug={workspaceSlug}
                    value={
                      field.state.value === undefined
                        ? (application.contactId ?? null)
                        : field.state.value
                    }
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    label={t("intake.contact")}
                    onEditorOpenChange={setContactEditorOpen}
                  />
                </div>
              )}
            </form.Field>
          ),
          projectPeriod: (
            <form.Field name="projectPeriod">
              {(field) => (
                <FormTextField
                  field={{
                    name: field.name,
                    state: { ...field.state, value: field.state.value ?? "" },
                    handleChange: field.handleChange,
                    handleBlur: field.handleBlur,
                  }}
                  className={styles.metadataField}
                  label={t("evidence.projectPeriod")}
                  maxLength={intakeLimits.projectPeriodLength}
                />
              )}
            </form.Field>
          ),
          requested: (
            <form.Field name="requested">
              {(field) => (
                <FormMoneyField
                  field={field}
                  precisionMessage={t("intake.amountPrecision")}
                  className={styles.metadataField}
                  label={t("intake.requested")}
                  placeholder={t("intake.notKnown")}
                  prefix={{
                    text: "€",
                    label: t("common:euros"),
                    isHidden: !field.state.value.trim(),
                  }}
                />
              )}
            </form.Field>
          ),
        }}
      />
    </EditorFrame>
  );
};

const SubmissionForm = (props: SectionProps<"content">) => {
  const { t } = useTranslation(["applicationIntake", "common", "contacts"]);
  const { form, submission } = useEditorForm(props, intakeContentSchema.pick({ answers: true }));

  return (
    <EditorFrame {...props} submission={submission}>
      <form.Field name="answers" mode="array">
        {(field) => (
          <>
            {field.state.value.map((answer, index) => (
              <fieldset
                key={answer.questionId}
                className={styles.section}
                aria-label={t("intake.section", { number: index + 1 })}
              >
                <div className={styles.sectionHeading}>
                  <span>{t("intake.section", { number: index + 1 })}</span>
                  <ActionMenu
                    label={t("intake.sectionActions", { number: index + 1 })}
                    trigger={
                      <Button
                        size="small"
                        variant="quiet"
                        iconOnly
                        aria-label={t("intake.sectionActions", { number: index + 1 })}
                      >
                        <Icon name="more" />
                      </Button>
                    }
                    items={[
                      ...(index > 0 ? [{ id: "up", label: t("intake.moveUp") }] : []),
                      ...(index < field.state.value.length - 1
                        ? [{ id: "down", label: t("intake.moveDown") }]
                        : []),
                      { id: "remove", label: t("intake.remove") },
                    ]}
                    onAction={(action) => {
                      if (action === "remove") {
                        field.removeValue(index);
                      } else {
                        field.swapValues(index, action === "up" ? index - 1 : index + 1);
                      }
                    }}
                  />
                </div>
                <form.Field name={`answers[${index}].question`}>
                  {(heading) => (
                    <FormTextField
                      field={heading}
                      label={t("intake.heading")}
                      autoFocus={index === 0}
                      maxLength={intakeLimits.questionLength}
                    />
                  )}
                </form.Field>
                <form.Field name={`answers[${index}].response`}>
                  {(body) => (
                    <FormTextField
                      field={body}
                      label={t("intake.body")}
                      multiline
                      rows={6}
                      maxLength={intakeLimits.responseLength}
                    />
                  )}
                </form.Field>
              </fieldset>
            ))}
            <Button
              size="small"
              variant="secondary"
              isDisabled={field.state.value.length >= intakeLimits.answersCount}
              onPress={() =>
                field.pushValue({ questionId: crypto.randomUUID(), question: "", response: "" })
              }
            >
              {t("intake.addSection")}
            </Button>
          </>
        )}
      </form.Field>
    </EditorFrame>
  );
};

const SummaryForm = (props: SectionProps<"details">) => {
  const { t } = useTranslation(["applicationIntake", "common", "contacts"]);
  const { form, submission } = useEditorForm(props, intakeDetailsSchema.pick({ summary: true }));

  return (
    <EditorFrame {...props} submission={submission}>
      <form.Field name="summary">
        {(field) => (
          <FormTextField
            field={field}
            label={t("intake.staffSummary")}
            multiline
            rows={5}
            autoFocus
            maxLength={intakeLimits.summaryLength}
          />
        )}
      </form.Field>
    </EditorFrame>
  );
};

export const IntakeForm = (props: EditorProps) => {
  const { t } = useTranslation("applicationIntake");
  const draft = props.editor.draft;
  if (!props.editor.ready || !draft) {
    return (
      <div className={styles.form}>
        <h3>{t(sectionLabels[props.editor.section ?? "details"])}</h3>
        <EditorLoading />
        <EditorClose label={t("preparation.close")} onClose={props.onClose} />
      </div>
    );
  }

  const key = `${draft.section}:${draft.revision}`;
  switch (draft.section) {
    case "title":
      return <TitleForm key={key} {...props} draft={draft} />;
    case "metadata":
      return <MetadataForm key={key} {...props} draft={draft} />;
    case "content":
      return <SubmissionForm key={key} {...props} draft={draft} />;
    case "details":
      return <SummaryForm key={key} {...props} draft={draft} />;
    case "reason":
      return null;
  }
};
