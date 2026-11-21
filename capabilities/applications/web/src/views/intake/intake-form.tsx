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
  SavedValue,
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
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
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
  // Details show each saved value beside its field; other sections compare in a panel.
  const fieldsShowSaved = editor.section === "metadata";
  return (
    <ConflictBanner
      title={t("intake.conflictTitle")}
      message={t(fieldsShowSaved ? "intake.conflictFields" : "intake.conflict")}
      keepMine={{ label: t("intake.keepChanges"), onPress: editor.keepMyChanges }}
      useSaved={{ label: t("intake.useLatest"), onPress: editor.useLatestSavedValues }}
      isDisabled={editor.pending}
      latest={
        fieldsShowSaved
          ? undefined
          : {
              toggleLabel: t("intake.viewLatest"),
              hideLabel: t("intake.hideLatest"),
              heading: t("intake.latest"),
              children: <LatestValues editor={editor} />,
            }
      }
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
        stickyActions={section === "content"}
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
            submitLabel={t(isRevision ? "intake.saveWorkingRevision" : "intake.save")}
            submittingLabel={t("editor.saving")}
            isSubmitDisabled={conflict || disabled || editor.pending}
          />
        }
      >
        <div className={styles.fields}>
          {conflict && <IntakeConflictNotice editor={editor} />}
          {isRevision && (
            <Text as="p" variant="caption">
              {t(section === "metadata" ? "intake.workingDetailsHint" : "intake.workingDraftHint")}
            </Text>
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
          {isRevision &&
            conflict &&
            section === "metadata" &&
            editor.reason.trim() !== editor.latest.reason.trim() && (
              <SavedValue label={t("intake.savedValue")}>
                {editor.latest.reason || t("intake.notKnown")}
              </SavedValue>
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
  const { content } = latest;

  return (
    <div className={styles.latestPreview}>
      <DescriptionList>
        {section === "title" && (
          <DescriptionListItem label={t("intake.projectTitle")}>
            {content.title}
          </DescriptionListItem>
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
            <DetailField editor={props.editor} field="applicant">
              <form.Field name="applicant">
                {(field) => (
                  <FormTextField
                    field={field}
                    isLabelHidden
                    label={t("intake.applicant")}
                    maxLength={intakeLimits.applicantLength}
                    autoFocus
                  />
                )}
              </form.Field>
            </DetailField>
          ),
          contact: (
            <DetailField editor={props.editor} field="contactId">
              <form.Field name="contactId">
                {(field) => (
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
                    isLabelHidden
                    onEditorOpenChange={setContactEditorOpen}
                  />
                )}
              </form.Field>
            </DetailField>
          ),
          projectPeriod: (
            <DetailField editor={props.editor} field="projectPeriod">
              <form.Field name="projectPeriod">
                {(field) => (
                  <FormTextField
                    field={{
                      name: field.name,
                      state: { ...field.state, value: field.state.value ?? "" },
                      handleChange: field.handleChange,
                      handleBlur: field.handleBlur,
                    }}
                    isLabelHidden
                    label={t("evidence.projectPeriod")}
                    maxLength={intakeLimits.projectPeriodLength}
                  />
                )}
              </form.Field>
            </DetailField>
          ),
          requested: (
            <DetailField editor={props.editor} field="requested">
              <form.Field name="requested">
                {(field) => (
                  <FormMoneyField
                    field={field}
                    precisionMessage={t("intake.amountPrecision")}
                    isLabelHidden
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
            </DetailField>
          ),
        }}
      />
    </EditorFrame>
  );
};

type MetadataField = "applicant" | "contactId" | "projectPeriod" | "requested";

/** A detail's control, followed in a conflict by its latest saved value when they differ. */
const DetailField = ({
  editor,
  field,
  children,
}: {
  editor: EditorProps["editor"];
  field: MetadataField;
  children: ReactNode;
}) => (
  <div className={styles.detailField}>
    {children}
    <MetadataSavedValue editor={editor} field={field} />
  </div>
);

/** In a conflict, a detail whose draft differs from the latest saved version shows that value. */
const MetadataSavedValue = ({
  editor,
  field,
}: {
  editor: EditorProps["editor"];
  field: MetadataField;
}) => {
  const { t } = useTranslation(["applicationIntake", "contacts"]);
  const { money } = useFormat();
  const draft = editor.draft;
  if (!editor.conflict || draft?.section !== "metadata") {
    return null;
  }
  const { content, contactId } = editor.latest;
  if (field === "contactId") {
    const current =
      draft.value.contactId === undefined ? editor.application.contactId : draft.value.contactId;
    return (current ?? null) === (contactId ?? null) ? null : (
      <SavedValue label={t("intake.savedValue")}>
        {contactId ? (
          <ContactLabel
            workspaceSlug={editor.workspaceSlug}
            contactId={contactId}
            fallback={t("intake.contactNotAvailable")}
          />
        ) : (
          t("contacts:noContact")
        )}
      </SavedValue>
    );
  }
  const saved = content[field] ?? "";
  if ((draft.value[field] ?? "").trim() === saved.trim()) {
    return null;
  }
  const amount = field === "requested" ? parseMoney(saved) : null;
  return (
    <SavedValue label={t("intake.savedValue")}>
      {amount?.ok ? money(amount.value) : saved || t("intake.notKnown")}
    </SavedValue>
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
                  <Text variant="caption">{t("intake.section", { number: index + 1 })}</Text>
                  <ActionMenu
                    label={t("intake.sectionActions", { number: index + 1 })}
                    trigger={
                      <Button
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
              variant="quiet"
              alignment="start"
              isDisabled={field.state.value.length >= intakeLimits.answersCount}
              onPress={() =>
                field.pushValue({ questionId: crypto.randomUUID(), question: "", response: "" })
              }
            >
              <Icon name="add" />
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
      <div>
        <SectionHeader level={3} title={t(sectionLabels[props.editor.section ?? "details"])} />
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
