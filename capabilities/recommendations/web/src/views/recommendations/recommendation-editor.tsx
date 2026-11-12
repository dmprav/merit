import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import {
  Form,
  FormActions,
  FormSelect,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { type ApplicationRoundContext } from "@merit/grantmaking/api";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { absolute, isNegative, fromMinorUnits } from "@merit/money";
import { normalizeMoneyInput, moneyInput, parseMoneyInput } from "@merit/money/input";
import {
  recommendationPositions,
  recommendationLimits,
  previewRecommendation,
} from "@merit/recommendations/domain";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Stack } from "@merit/ui/layout";
import { SectionHeader } from "@merit/ui/section-header";
import { Tooltip } from "@merit/ui/tooltip";

import type { RecommendationDraft, SaveRecommendation } from "../../contracts/recommendations";
import { useRecommendationEditor } from "../../controllers/recommendations/use-recommendation-editor";
import { recommendationFormSchema } from "./form-schema";
import { recommendationPositionKeys, recommendationSaveError } from "./messages";
import localStyles from "./recommendation-editor.module.css";
import { RecommendationSummary } from "./recommendation-summary";
import recommendationStyles from "./recommendation.module.css";

const zeroAllocation = fromMinorUnits(0n);
const actionLabels = {
  resume: { tooltip: "editor.resume", accessible: "editor.resumeFor", text: "editor.resume" },
  defer: { tooltip: "intake.defer", accessible: "intake.deferFor", text: "intake.defer" },
  edit: { tooltip: "editor.edit", accessible: "editor.openFor", text: "editor.title" },
  add: { tooltip: "editor.add", accessible: "editor.addFor", text: "editor.add" },
} as const;

type RecommendationEditorProps = {
  application: Application;
  round: ApplicationRoundContext;
  disabled: boolean;
  showActionLabel?: boolean;
  onClose?: () => void | Promise<void>;
  children?: (slots: {
    summary: ReactNode;
    editor: ReactNode;
    action: ReactNode;
    closeAction: ReactNode;
  }) => ReactNode;
  draft?: RecommendationDraft;
  onDraftChange: (draft: RecommendationDraft | undefined) => void;
  onSave: SaveRecommendation;
};

export const RecommendationEditor = ({
  application,
  round,
  disabled,
  showActionLabel = false,
  draft,
  onDraftChange,
  onSave,
  onClose,
  children,
}: RecommendationEditorProps) => {
  const { t } = useTranslation("fundingRecommendations");
  const { managerRecommendation: recommendation } = application;
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const { isEditing, isSaving, isOpen, canResume, open, close, save } = useRecommendationEditor({
    application,
    draft,
    onDraftChange,
    onSave,
    onClose: async () => {
      await onClose?.();
      restoreFocus.current = true;
    },
  });

  useEffect(() => {
    if (restoreFocus.current && editButton.current) {
      editButton.current.focus();
      restoreFocus.current = false;
    }
  });

  const action = (
    <RecommendationAction
      application={application}
      disabled={disabled}
      showActionLabel={showActionLabel}
      canResume={canResume}
      isOpen={isOpen}
      ref={editButton}
      onOpen={open}
    />
  );
  const summary = recommendation ? (
    <RecommendationSummary recommendation={recommendation} manager={round.manager} />
  ) : (
    <p className={localStyles.empty}>{t("applications.notRecommended")}</p>
  );

  const closeAction = (
    <Button
      variant="quiet"
      size="small"
      iconOnly
      aria-label={t("editor.close")}
      isDisabled={isSaving}
      onPress={() => void close()}
    >
      <Icon name="close" />
    </Button>
  );
  const editor =
    isEditing && draft ? (
      <RecommendationForm
        application={application}
        round={round}
        initialDraft={draft}
        onDraftChange={onDraftChange}
        onSave={save}
        close={close}
      />
    ) : null;

  return children ? (
    children({ summary, editor, action, closeAction })
  ) : (
    <>
      <SectionHeader
        className={localStyles.header}
        title={t("applications.recommendation")}
        aside={action}
      />
      {summary}
      {editor}
    </>
  );
};

const RecommendationAction = ({
  application,
  disabled,
  showActionLabel,
  canResume,
  isOpen,
  ref,
  onOpen,
}: Pick<RecommendationEditorProps, "application" | "disabled" | "showActionLabel"> & {
  canResume: boolean;
  isOpen: boolean;
  ref: Ref<HTMLButtonElement>;
  onOpen: () => void;
}) => {
  const { t } = useTranslation("fundingRecommendations");
  const { title, managerRecommendation: recommendation } = application;
  const preparingDeferral = !recommendation && application.intakeStatus === "in_preparation";
  let action: keyof typeof actionLabels;
  if (canResume) {
    action = "resume";
  } else if (preparingDeferral) {
    action = "defer";
  } else if (recommendation) {
    action = "edit";
  } else {
    action = "add";
  }
  const labels = actionLabels[action];
  const showLabel = preparingDeferral || showActionLabel;

  return (
    <Tooltip content={t(labels.tooltip)}>
      <Button
        size="small"
        iconOnly={!showLabel}
        data-draft={canResume || undefined}
        ref={ref}
        variant={preparingDeferral ? "secondary" : "quiet"}
        isDisabled={disabled}
        className={isOpen ? localStyles.editingAction : undefined}
        aria-label={t(labels.accessible, { title })}
        onPress={onOpen}
      >
        {!preparingDeferral && <Icon name="edit" />}
        {showLabel && t(labels.text)}
      </Button>
    </Tooltip>
  );
};

type RecommendationFormProps = {
  application: Application;
  round: ApplicationRoundContext;
  initialDraft: RecommendationDraft;
  onDraftChange: (draft: RecommendationDraft) => void;
  onSave: SaveRecommendation;
  close: (discard?: boolean) => Promise<void>;
};

const RecommendationForm = ({
  application,
  round,
  initialDraft,
  onDraftChange,
  onSave,
  close,
}: RecommendationFormProps) => {
  const { t } = useTranslation(["fundingRecommendations", "common"]);
  const { title } = application;
  const [amountInputError, setAmountInputError] = useState(false);
  const formSchema = recommendationFormSchema(t);

  const { form, submission } = useForm({
    defaultValues: initialDraft,
    schema: useTranslatedSchema(formSchema),
    onChange: onDraftChange,
    submitErrorMessage: t("editor.saveError"),
    onSubmit: async (value) => {
      // Form validation does not apply schema transformations to submitted values.
      const failure = await onSave(formSchema.parse(value));
      if (!failure) {
        await close(true);
      }
      return recommendationSaveError(t, failure);
    },
  });

  return (
    <Form
      submitOnModEnter
      submission={submission}
      className={recommendationStyles.form}
      scrollFields
      label={t("editor.openFor", { title })}
      actions={
        <FormActions
          submission={submission}
          onCancel={() => void close()}
          cancelLabel={t("preparation.close")}
          discard={{ label: t("preparation.discard"), onPress: () => void close(true) }}
          submitLabel={t("editor.save")}
          submittingLabel={t("editor.saving")}
        />
      }
    >
      <Stack gap={5} className={localStyles.fields}>
        {application.intakeStatus === "in_preparation" && <p>{t("intake.fundingNotReady")}</p>}
        <AllocationFields form={form} setAmountInputError={setAmountInputError} />
        <span role="status">{amountInputError ? t("validation.amountPrecision") : ""}</span>
        <form.Field name="reasoning">
          {(field) => (
            <FormTextField
              field={field}
              label={t("editor.reasoning")}
              multiline
              rows={6}
              isRequired
              maxLength={recommendationLimits.reasoningLength}
            />
          )}
        </form.Field>
        <RecommendationBudget form={form} application={application} round={round} />
      </Stack>
    </Form>
  );
};

type RecommendationFormModel = ReturnType<typeof useForm<RecommendationDraft>>["form"];

const AllocationFields = ({
  form,
  setAmountInputError,
}: {
  form: RecommendationFormModel;
  setAmountInputError: (value: boolean) => void;
}) => {
  const { t } = useTranslation(["fundingRecommendations", "common"]);
  return (
    <div className={localStyles.allocationFields}>
      <form.Field name="position">
        {(field) => (
          <FormSelect
            field={{
              name: field.name,
              state: field.state,
              handleBlur: field.handleBlur,
              handleChange: (value) => {
                setAmountInputError(false);
                field.handleChange(value);
              },
            }}
            label={t("editor.position")}
            isRequired
            autoFocus
            items={recommendationPositions.map((position) => ({
              id: position,
              label: t(recommendationPositionKeys[position]),
            }))}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.position}>
        {(position) =>
          position !== "Defer" && (
            <form.Field name="amount">
              {(field) => (
                <FormTextField
                  field={{
                    name: field.name,
                    state: field.state,
                    handleBlur: field.handleBlur,
                    handleChange: (value) => {
                      // Reject excess precision with feedback while retaining the previous input.
                      const accepted = moneyInput(value);
                      setAmountInputError(accepted === null);
                      if (accepted !== null) {
                        field.handleChange(accepted);
                      }
                    },
                  }}
                  label={t("editor.amount")}
                  isRequired
                  prefix={{ text: "€", label: t("common:euros") }}
                  description={
                    position === "Fund with a condition" ? t("editor.conditionalHint") : undefined
                  }
                  inputMode="decimal"
                  onBlur={() => field.handleChange(normalizeMoneyInput(field.state.value))}
                />
              )}
            </form.Field>
          )
        }
      </form.Subscribe>
    </div>
  );
};

const RecommendationBudget = ({
  form,
  application,
  round,
}: Pick<RecommendationFormProps, "application" | "round"> & { form: RecommendationFormModel }) => {
  const { t } = useTranslation(["fundingRecommendations", "common"]);
  const { money } = useFormat();
  const available = previewRecommendation(round, application, {
    position: "Defer",
    allocation: zeroAllocation,
  });
  return (
    <Stack gap={2} className={localStyles.budgetContext}>
      <p className={localStyles.budgetPreview}>
        <span>{t("editor.availableBefore")}</span>
        <strong>
          {available.ok && available.totals.remaining !== null
            ? money(available.totals.remaining)
            : "—"}
        </strong>
      </p>
      <form.Subscribe selector={(state) => [state.values.position, state.values.amount] as const}>
        {([position, amount]) => {
          const allocation = position === "Defer" ? zeroAllocation : parseMoneyInput(amount);
          const preview =
            allocation === null
              ? null
              : previewRecommendation(round, application, {
                  position,
                  allocation,
                });

          return (
            <p
              className={localStyles.budgetPreview}
              role="status"
              aria-label={t("editor.budgetPreview")}
            >
              <span>
                {t(
                  preview?.ok &&
                    preview.totals.remaining !== null &&
                    isNegative(preview.totals.remaining)
                    ? "editor.previewOver"
                    : "editor.previewRemaining",
                )}
              </span>{" "}
              <strong
                className={
                  preview?.ok &&
                  preview.totals.remaining !== null &&
                  isNegative(preview.totals.remaining)
                    ? localStyles.overBudget
                    : undefined
                }
              >
                {preview?.ok && preview.totals.remaining !== null
                  ? money(absolute(preview.totals.remaining))
                  : "—"}
              </strong>
            </p>
          );
        }}
      </form.Subscribe>
    </Stack>
  );
};
