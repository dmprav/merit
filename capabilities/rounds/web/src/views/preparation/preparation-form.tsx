import type { ReactNode, ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Form, FormActions, FormTextField, useForm, useTranslatedSchema } from "@merit/forms";
import { type RoundView } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { parseMoneyInput } from "@merit/money/input";
import { budgetChangeRequirements, roundPreparationLimits } from "@merit/rounds/domain";

import {
  hasPreparationChanges,
  hasPreparationDraft,
  type PreparationDraft,
  type PreparationValues,
  type PreparationSectionDraft,
} from "../../controllers/preparation/preparation-state";
import { CriteriaFields } from "./criteria-fields";
import styles from "./preparation.module.css";

type FormSection = "purpose" | "criteria" | "budget";

type FormProps = {
  draft: PreparationDraft;
  round: RoundView;
  onChange: (draft: PreparationDraft) => void;
  onSave: (draft: PreparationDraft) => Promise<string | null>;
  onCancel: () => void;
  onDiscard?: () => void;
  inline?: boolean;
  beforeFields?: ReactNode;
  afterFields?: ReactNode;
  isConflict?: boolean;
  budgetPreviouslySet?: boolean;
};

type SectionProps<S extends FormSection> = Omit<FormProps, "draft"> & {
  draft: PreparationSectionDraft<S>;
};

const usePreparationForm = <S extends FormSection>(
  props: SectionProps<S>,
  schema: z.ZodType<PreparationValues[S], PreparationValues[S]>,
) => {
  const { t } = useTranslation("roundPreparation");

  return useForm<PreparationValues[S]>({
    defaultValues: props.draft.value,
    schema: useTranslatedSchema(schema),
    onChange: (value) => props.onChange({ ...props.draft, value } as PreparationDraft),
    onSubmit: (value) =>
      props.isConflict
        ? Promise.resolve(t("preparation.conflict"))
        : props.onSave({ ...props.draft, value } as PreparationDraft),
    submitErrorMessage: t("preparation.saveError"),
  });
};

const PreparationFrame = ({
  draft,
  submission,
  children,
  onCancel,
  onDiscard,
  inline = false,
  beforeFields,
  afterFields,
  isConflict,
}: FormProps & {
  submission: ComponentProps<typeof Form>["submission"];
  children: ReactNode;
}) => {
  const { t } = useTranslation("roundPreparation");
  const changed = hasPreparationDraft(draft);

  return (
    <Form
      submission={submission}
      label={t(`preparation.edit.${draft.section}`)}
      className={styles.form}
      scrollFields={!inline}
      submitOnModEnter
      actions={
        <FormActions
          submission={submission}
          discard={
            changed && onDiscard
              ? { label: t("preparation.discard"), onPress: onDiscard }
              : undefined
          }
          onCancel={onCancel}
          cancelLabel={t(onDiscard || !changed ? "preparation.close" : "preparation.discard")}
          submitLabel={t(
            draft.section === "budget" ? "preparation.updateBudget" : "preparation.save",
          )}
          submittingLabel={t("editor.saving")}
          isSubmitDisabled={!hasPreparationChanges(draft) || isConflict}
        />
      }
    >
      {beforeFields}
      {draft.section !== "purpose" && changed && (
        <p className={styles.hint}>{t("preparation.draftHint")}</p>
      )}
      <div className={styles.fields}>{children}</div>
      {afterFields}
    </Form>
  );
};

const PurposeForm = (props: SectionProps<"purpose">) => {
  const { t } = useTranslation("roundPreparation");
  const { form, submission } = usePreparationForm(
    props,
    z.object({
      purpose: z
        .string()
        .refine(
          (value) => value.trim().length <= roundPreparationLimits.purposeLength,
          t("preparation.purposeTooLong"),
        ),
    }),
  );

  return (
    <PreparationFrame {...props} submission={submission}>
      <form.Field name="purpose">
        {(field) => (
          <FormTextField
            field={field}
            label={t("round.purpose")}
            multiline
            rows={10}
            autoFocus
            maxLength={roundPreparationLimits.purposeLength}
          />
        )}
      </form.Field>
    </PreparationFrame>
  );
};

const CriteriaForm = (props: SectionProps<"criteria">) => {
  const { t } = useTranslation("roundPreparation");
  const { form, submission } = usePreparationForm(
    props,
    z.object({
      criteria: z
        .array(
          z.object({
            key: z.string(),
            id: z.uuid(),
            title: z
              .string()
              .refine(
                (value) =>
                  Boolean(value.trim()) &&
                  value.trim().length <= roundPreparationLimits.criterionTitleLength,
                t("preparation.criterionRequired"),
              ),
            description: z
              .string()
              .refine(
                (value) => value.trim().length <= roundPreparationLimits.criterionDescriptionLength,
                t("preparation.guidanceTooLong"),
              ),
          }),
        )
        .max(roundPreparationLimits.criteriaCount, t("preparation.criteriaLimit")),
    }),
  );

  return (
    <PreparationFrame {...props} submission={submission}>
      <CriteriaFields form={form} isSubmitting={submission.isSubmitting} />
    </PreparationFrame>
  );
};

const BudgetForm = (props: SectionProps<"budget">) => {
  const { t } = useTranslation(["roundPreparation", "common"]);
  const { money } = useFormat();
  const { round, budgetPreviouslySet = false } = props;

  const { form, submission } = usePreparationForm(
    props,
    z.object({ amount: z.string(), reason: z.string() }).superRefine((value, context) => {
      const amount = parseMoneyInput(value.amount);
      if (value.amount.trim() && !amount) {
        context.addIssue({
          code: "custom",
          path: ["amount"],
          message: t("validation.amountFormat"),
        });
      }
      const { reasonRequired } = budgetChangeRequirements(
        round.budget,
        amount,
        budgetPreviouslySet,
      );
      if (reasonRequired && !value.reason.trim()) {
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: t("preparation.reasonRequired"),
        });
      }
      if (value.reason.trim().length > roundPreparationLimits.budgetReasonLength) {
        context.addIssue({
          code: "custom",
          path: ["reason"],
          message: t("preparation.reasonTooLong"),
        });
      }
    }),
  );

  return (
    <PreparationFrame {...props} submission={submission}>
      <>
        <p>
          {t("preparation.currentBudget", {
            amount: round.budget === null ? t("preparation.notSet") : money(round.budget),
          })}
        </p>
        <form.Field name="amount">
          {(field) => (
            <FormTextField
              field={field}
              label={t("preparation.amount")}
              prefix={{
                text: "€",
                label: t("common:euros"),
                isHidden: !field.state.value.trim(),
              }}
              inputMode="decimal"
              autoFocus
              placeholder={t("preparation.notSet")}
            />
          )}
        </form.Field>
        {(round.budget !== null || budgetPreviouslySet) && (
          <form.Subscribe selector={(state) => state.values.amount}>
            {(amount) => {
              const parsed = parseMoneyInput(amount);
              const { reasonRequired } = budgetChangeRequirements(
                round.budget,
                parsed,
                budgetPreviouslySet,
              );

              return (
                <form.Field name="reason">
                  {(field) => (
                    <FormTextField
                      field={field}
                      label={t("preparation.reason")}
                      multiline
                      rows={3}
                      isRequired={reasonRequired}
                      maxLength={roundPreparationLimits.budgetReasonLength}
                    />
                  )}
                </form.Field>
              );
            }}
          </form.Subscribe>
        )}
      </>
    </PreparationFrame>
  );
};

export const PreparationForm = (props: FormProps) => {
  const { draft } = props;
  const key = `${draft.section}/${draft.revision}`;
  switch (draft.section) {
    case "purpose":
      return <PurposeForm key={key} {...props} draft={draft} />;
    case "criteria":
      return <CriteriaForm key={key} {...props} draft={draft} />;
    case "budget":
      return <BudgetForm key={key} {...props} draft={draft} />;
    default:
      return null;
  }
};
