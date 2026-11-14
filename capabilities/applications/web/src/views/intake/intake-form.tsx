import { useState, type ReactNode, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { intakeContentSchema, intakeDetailsSchema, intakeLimits } from "@merit/applications/domain";
import { ContactPicker } from "@merit/contacts-web/contacts";
import { Form, FormActions, FormTextField, useForm, useTranslatedSchema } from "@merit/forms";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { EditorLoading, EditorClose } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { Notice } from "@merit/ui/notice";
import { TextField } from "@merit/ui/text-field";

import type {
  IntakeDraft,
  IntakeSection,
  IntakeValues,
  SectionDraft,
} from "../../controllers/intake/intake-state";
import type { ApplicationIntakeController } from "../../controllers/intake/use-application-intake";
import { ApplicationDetails } from "./application-details";
import styles from "./intake-form.module.css";
import { intakeError } from "./messages";

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
  const { section, conflict } = editor;
  const isRevision = Boolean(editor.workingRevision) && section !== "details";

  return (
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
        {conflict && <IntakeConflict editor={editor} />}
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
  );
};

const IntakeConflict = ({ editor }: Pick<EditorProps, "editor">) => {
  const { t } = useTranslation("applicationIntake");
  const { section, latest } = editor;

  return (
    <Notice as="div" tone="warning">
      <p>{t("intake.conflict")}</p>
      <details>
        <summary>{t("intake.latest")}</summary>
        {section === "title" && <p>{latest.content.title}</p>}
        {section === "metadata" && (
          <>
            <p>
              {t("intake.applicant")}: {latest.content.applicant || t("intake.notKnown")}
            </p>
            <p>
              {t("intake.requested")}: {latest.content.requested || t("intake.notKnown")}
            </p>
            <p>
              {t("intake.contact")}:{" "}
              {editor.application.submission?.contact || t("intake.notKnown")}
            </p>
            <p>
              {t("evidence.projectPeriod")}: {latest.content.projectPeriod || t("intake.notKnown")}
            </p>
          </>
        )}
        {section === "content" &&
          latest.content.answers.map((answer, index) => (
            <div key={index}>
              <strong>{answer.question}</strong>
              <p className={styles.latest}>{answer.response}</p>
            </div>
          ))}
        {section === "details" ? <p>{latest.summary}</p> : <p>{latest.reason}</p>}
      </details>
      <p>{t("intake.keepChangesHelp")}</p>
      <div className={styles.actions}>
        <Button size="small" onPress={editor.keepMyChanges}>
          {t("intake.keepChanges")}
        </Button>
        <Button size="small" variant="secondary" onPress={editor.useLatestSavedValues}>
          {t("intake.useLatest")}
        </Button>
      </div>
    </Notice>
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
                <FormTextField
                  field={field}
                  className={`${styles.metadataField} ${styles.amountField}`}
                  label={t("intake.requested")}
                  inputMode="decimal"
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
