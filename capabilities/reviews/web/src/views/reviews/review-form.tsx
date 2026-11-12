import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { ContactPicker } from "@merit/contacts-web/contacts";
import { calendarDateInputSchema } from "@merit/dates";
import {
  Form,
  FormActions,
  FormDateField,
  FormSelect,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { assessmentInputSchema, isEligibleReviewer } from "@merit/reviews/domain";
import { Button } from "@merit/ui/button";
import { Notice } from "@merit/ui/notice";

import type { ReviewProblem } from "../../contracts/reviews";
import type { ReviewDraft, ReviewFormValues } from "../../controllers/reviews/drafts";
import {
  addCriterionObservations,
  reconcileObservations,
} from "../../controllers/reviews/observations";
import { contentFromValues } from "../../controllers/reviews/values";
import { reviewError } from "./messages";
import styles from "./review-work.module.css";

const assessmentFormSchema = assessmentInputSchema.safeExtend({
  date: calendarDateInputSchema.nullable(),
});

type ReviewFormProps = {
  followUp: boolean;
  draft: Pick<ReviewDraft, "mode" | "values">;
  workspaceSlug: string;
  versions: { id: string; label: string }[];
  criteriaHistory: {
    version: number;
    criteria: { id: string; title: string; description?: string }[];
  }[];
  onChange: (value: ReviewFormValues) => void;
  onSave: (value: ReviewFormValues) => Promise<ReviewProblem | null>;
  onDiscard: () => void;
  onClose: () => void;
  conflict: boolean;
};

export const ReviewForm = ({
  draft,
  workspaceSlug,
  versions,
  criteriaHistory,
  onChange,
  onSave,
  onDiscard,
  onClose,
  conflict,
  followUp,
}: ReviewFormProps) => {
  const { t } = useTranslation(["reviews", "common"]);
  const [showNotes, setShowNotes] = useState(false);
  const { form, submission } = useReviewForm({ draft, onChange, onSave });
  const submitLabel = t(draft.mode === "request" ? "request" : "saveAssessment");

  return (
    <Form
      label={t(draft.mode)}
      submission={submission}
      actions={
        <FormActions
          submission={submission}
          discard={{ label: t("discard"), onPress: onDiscard }}
          onCancel={onClose}
          cancelLabel={t("close")}
          submitLabel={submitLabel}
          submittingLabel={submitLabel}
          isSubmitDisabled={conflict}
        />
      }
    >
      <div className={styles.form}>
        {followUp && draft.mode === "record" && <Notice tone="neutral">{t("followUpHint")}</Notice>}
        {draft.mode !== "edit" && (
          <form.Field name="contactId">
            {(field) => (
              <ContactPicker
                isEligible={isEligibleReviewer}
                workspaceSlug={workspaceSlug}
                autoFocus={!draft.values.contactId}
                value={field.state.value || null}
                onChange={(id) => field.handleChange(id ?? "")}
                onBlur={field.handleBlur}
                isDisabled={submission.isSubmitting}
                error={
                  field.state.meta.isTouched && !field.state.meta.isValid
                    ? t("contactUnavailable")
                    : undefined
                }
                isRequired
                label={t("reviewer")}
                emptySelectionLabel={t("selectReviewer")}
              />
            )}
          </form.Field>
        )}
        {draft.mode === "request" ? (
          <p className={styles.requestHint}>{t("requestHint")}</p>
        ) : (
          <AssessmentFields
            form={form}
            draft={draft}
            versions={versions}
            criteriaHistory={criteriaHistory}
            showNotes={showNotes}
            setShowNotes={setShowNotes}
          />
        )}
      </div>
    </Form>
  );
};

const useReviewForm = ({
  draft,
  onChange,
  onSave,
}: Pick<ReviewFormProps, "draft" | "onChange" | "onSave">) => {
  const { t } = useTranslation(["reviews", "common"]);
  return useForm({
    defaultValues: draft.values,
    schema: useTranslatedSchema(
      z.custom<ReviewFormValues>().superRefine((value, ctx) => {
        if (!value.contactId) {
          ctx.addIssue({ code: "custom", path: ["contactId"], message: t("contactUnavailable") });
        }
        if (draft.mode !== "request") {
          const parsed = assessmentFormSchema.safeParse(contentFromValues(value));
          if (!parsed.success) {
            for (const issue of parsed.error.issues) {
              ctx.addIssue({
                code: "custom",
                path: issue.path,
                message: t(issue.path[0] === "date" ? "dateInvalid" : "invalidReview"),
              });
            }
          }
        }
      }),
    ),
    onChange,
    onSubmit: async (value) => reviewError(t, await onSave(value)),
    submitErrorMessage: t("error"),
  });
};

type AssessmentFieldsProps = Pick<ReviewFormProps, "draft" | "versions" | "criteriaHistory"> & {
  form: ReturnType<typeof useReviewForm>["form"];
  showNotes: boolean;
  setShowNotes: (value: boolean) => void;
};

const AssessmentFields = ({
  form,
  draft,
  versions,
  criteriaHistory,
  showNotes,
  setShowNotes,
}: AssessmentFieldsProps) => {
  const { t } = useTranslation(["reviews", "common"]);
  return (
    <>
      <form.Field name="reasoning">
        {(field) => (
          <FormTextField
            field={field}
            label={t("reasoning")}
            autoFocus={Boolean(draft.values.contactId)}
            isRequired
            multiline
            rows={5}
            maxLength={20000}
          />
        )}
      </form.Field>
      <div className={styles.basis}>
        <form.Field name="position">
          {(field) => (
            <FormSelect
              field={field}
              label={t("position")}
              items={[
                { id: "unknown", label: t("notStated") },
                { id: "Fund", label: t("fund") },
                { id: "Fund with a condition", label: t("conditional") },
                { id: "Defer", label: t("defer") },
                { id: "Decline", label: t("decline") },
              ]}
            />
          )}
        </form.Field>
        <form.Field name="amount">
          {(field) => (
            <FormTextField
              field={field}
              label={t("amount")}
              placeholder={t("notStated")}
              prefix={{
                text: "€",
                label: t("common:euros"),
                isHidden: !field.state.value.trim(),
              }}
              inputMode="decimal"
              maxLength={32}
            />
          )}
        </form.Field>
      </div>
      <AssessmentBasis form={form} versions={versions} criteriaHistory={criteriaHistory} />
      <p className={styles.meta}>{t("requestedBasis")}</p>
      <form.Field name="date">
        {(field) => <FormDateField field={field} label={t("assessmentDate")} />}
      </form.Field>
      <CriterionNotes
        form={form}
        criteriaHistory={criteriaHistory}
        showNotes={showNotes}
        setShowNotes={setShowNotes}
      />
      {draft.mode === "edit" && (
        <form.Field name="note">
          {(field) => <FormTextField field={field} label={t("note")} maxLength={2000} />}
        </form.Field>
      )}
    </>
  );
};

const AssessmentBasis = ({
  form,
  versions,
  criteriaHistory,
}: Pick<AssessmentFieldsProps, "form" | "versions" | "criteriaHistory">) => {
  const { t } = useTranslation(["reviews", "common"]);
  return (
    <div className={styles.basis}>
      <form.Field name="applicationVersion">
        {(field) => (
          <FormSelect
            field={field}
            label={t("applicationVersion")}
            items={[{ id: "unknown", label: t("unknown") }, ...versions]}
          />
        )}
      </form.Field>
      <form.Field
        name="criteriaVersion"
        listeners={{
          onChange: ({ value }) => {
            const existing = form.getFieldValue("observations");
            const selected =
              criteriaHistory.find((entry) => String(entry.version) === value)?.criteria ?? [];
            form.setFieldValue("observations", reconcileObservations(existing, selected));
          },
        }}
      >
        {(field) => (
          <FormSelect
            field={field}
            label={t("criteriaVersion")}
            items={[
              { id: "unknown", label: t("unknown") },
              ...criteriaHistory.map((entry, index) => ({
                id: String(entry.version),
                label:
                  index === criteriaHistory.length - 1
                    ? t("currentCriteria")
                    : t("earlierCriteria", { version: entry.version }),
              })),
            ]}
          />
        )}
      </form.Field>
    </div>
  );
};

const CriterionNotes = ({
  form,
  criteriaHistory,
  showNotes,
  setShowNotes,
}: Pick<AssessmentFieldsProps, "form" | "criteriaHistory" | "showNotes" | "setShowNotes">) => {
  const { t } = useTranslation(["reviews", "common"]);
  return (
    <form.Field name="observations" mode="array">
      {(field) => {
        const selectedCriteria =
          criteriaHistory.find(
            (entry) => String(entry.version) === form.getFieldValue("criteriaVersion"),
          )?.criteria ?? [];
        const expanded = showNotes || field.state.value.some((item) => item.text.trim());

        return (
          <section className={styles.criterionNotes} aria-label={t("observations")}>
            {expanded && field.state.value.length > 0 ? (
              <>
                <div className={styles.notesHeading}>
                  <h3>{t("observations")}</h3>
                </div>
                {field.state.value.map((observation, index) => (
                  <form.Field key={index} name={`observations[${index}].text`}>
                    {(item) => (
                      <FormTextField
                        field={item}
                        label={observation.criterion}
                        autoFocus={showNotes && index === 0}
                        onFocus={(event) => event.target.scrollIntoView({ block: "nearest" })}
                        multiline
                        rows={3}
                        maxLength={5000}
                      />
                    )}
                  </form.Field>
                ))}
              </>
            ) : field.state.value.length > 0 || selectedCriteria.length > 0 ? (
              <Button
                size="small"
                variant="quiet"
                onPress={() => {
                  field.handleChange(addCriterionObservations(field.state.value, selectedCriteria));
                  setShowNotes(true);
                }}
              >
                {t("addObservations")}
              </Button>
            ) : (
              <p className={styles.meta}>{t("chooseCriteriaForNotes")}</p>
            )}
          </section>
        );
      }}
    </form.Field>
  );
};
