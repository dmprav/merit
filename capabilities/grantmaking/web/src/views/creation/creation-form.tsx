import { useTranslation } from "react-i18next";
import { z } from "zod";

import { intakeLimits } from "@merit/applications/domain";
import { calendarDateInputSchema } from "@merit/dates";
import {
  Form,
  FormActions,
  FormDateField,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { parseMoneyInput } from "@merit/money/input";
import { roundPreparationLimits } from "@merit/rounds/domain";

import type { CreationDraft, CreationTarget } from "../../contracts/creation";
import styles from "./creation-composer.module.css";

type CreationFormProps = {
  titleId?: string;
  draft: CreationDraft;
  target: CreationTarget;
  onChange: (draft: CreationDraft) => void;
  onDiscard: () => void;
  onClose: () => void;
  onSave: (draft: CreationDraft) => Promise<string | null>;
};

export const CreationForm = ({
  titleId,
  draft,
  target,
  onChange,
  onDiscard,
  onClose,
  onSave,
}: CreationFormProps) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const { form, submission, isRound, limits, titleLabel, bodyLabel, label } = useCreationForm({
    draft,
    target,
    onChange,
    onSave,
  });

  const bodyField = (
    <form.Field name="body">
      {(field) => (
        <FormTextField field={field} label={bodyLabel} multiline rows={3} maxLength={limits.body} />
      )}
    </form.Field>
  );

  return (
    <Form
      label={label}
      submission={submission}
      className={styles.form}
      actions={
        <FormActions
          submission={submission}
          onCancel={onClose}
          cancelLabel={t("preparation.close")}
          discard={{ label: t("creation.discard"), onPress: onDiscard }}
          submitLabel={t(isRound ? "preparation.create" : "intake.add")}
          submittingLabel={t("preparation.creating")}
        />
      }
    >
      <div className={styles.fields}>
        <form.Field name="title">
          {(field) => (
            <FormTextField
              id={titleId}
              field={field}
              label={titleLabel}
              autoFocus
              isRequired
              maxLength={limits.title}
            />
          )}
        </form.Field>
        {isRound && bodyField}
        <div className={styles.properties}>
          {!isRound && (
            <form.Field name="applicant">
              {(field) => (
                <FormTextField
                  field={field}
                  label={t("intake.applicant")}
                  maxLength={intakeLimits.applicantLength}
                />
              )}
            </form.Field>
          )}
          <form.Field name="amount">
            {(field) => (
              <FormTextField
                field={field}
                label={t(isRound ? "creation.budget" : "intake.requested")}
                inputMode="decimal"
                maxLength={limits.amount}
                placeholder={t(isRound ? "preparation.notSet" : "intake.notKnown")}
                prefix={{
                  text: "€",
                  label: t("common:euros"),
                  isHidden: !field.state.value.trim(),
                }}
              />
            )}
          </form.Field>
          {isRound && (
            <form.Field name="meetingDate">
              {(field) => <FormDateField field={field} label={t("round.committeeDate")} />}
            </form.Field>
          )}
        </div>
        {!isRound && bodyField}
      </div>
    </Form>
  );
};

const useCreationForm = ({
  draft,
  target,
  onChange,
  onSave,
}: Pick<CreationFormProps, "draft" | "target" | "onChange" | "onSave">) => {
  const { t } = useTranslation(["fundingRounds", "common"]);
  const isRound = target.kind === "round";
  const limits = isRound
    ? {
        title: roundPreparationLimits.titleLength,
        body: roundPreparationLimits.purposeLength,
        amount: roundPreparationLimits.amountLength,
      }
    : {
        title: intakeLimits.titleLength,
        body: intakeLimits.responseLength,
        amount: intakeLimits.amountLength,
      };
  const titleLabel = t(isRound ? "preparation.name" : "intake.projectTitle");
  const bodyLabel = t(isRound ? "round.purpose" : "intake.material");
  const label = t(isRound ? "preparation.create" : "intake.add");

  const { form, submission } = useForm({
    defaultValues: draft,
    schema: useTranslatedSchema(
      z.object({
        requestId: z.string(),
        title: z
          .string()
          .trim()
          .min(1, t(isRound ? "preparation.titleRequired" : "creation.titleRequired"))
          .max(limits.title),
        body: z.string().trim().max(limits.body),
        amount: z
          .string()
          .trim()
          .max(limits.amount)
          .refine(
            (value) => !value || parseMoneyInput(value) !== null,
            t("validation.amountFormat"),
          ),
        meetingDate: z
          .string()
          .refine(
            (value) => !value || calendarDateInputSchema.safeParse(value).success,
            t("preparation.dateInvalid"),
          ),
        applicant: z.string().trim().max(intakeLimits.applicantLength),
      }),
    ),
    onChange,
    onSubmit: onSave,
    submitErrorMessage: t("creation.saveError"),
  });

  return { form, submission, isRound, limits, titleLabel, bodyLabel, label };
};
