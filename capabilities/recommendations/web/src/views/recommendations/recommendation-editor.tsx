import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import {
  ConflictBanner,
  Form,
  FormActions,
  FormMoneyField,
  FormSelect,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { type ApplicationRoundContext } from "@merit/grantmaking/api";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { absolute, isNegative, fromMinorUnits } from "@merit/money";
import { parseMoneyInput } from "@merit/money/input";
import {
  recommendationPositions,
  recommendationLimits,
  previewRecommendation,
  canChangeRecommendation,
} from "@merit/recommendations/domain";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading, EditorClose } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { Stack } from "@merit/ui/layout";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
import { Tooltip } from "@merit/ui/tooltip";

import type { RecommendationDraft, SaveRecommendation } from "../../contracts/recommendations";
import type { RecommendationConflict } from "../../controllers/recommendations/use-recommendation";
import { useRecommendationEditor } from "../../controllers/recommendations/use-recommendation-editor";
import { recommendationFormSchema } from "./form-schema";
import { recommendationPositionKeys, recommendationSaveError } from "./messages";
import localStyles from "./recommendation-editor.module.css";
import { RecommendationSummary } from "./recommendation-summary";

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
  ready?: boolean;
  showActionLabel?: boolean;
  onClose?: () => void | Promise<void>;
  children?: (slots: {
    summary: ReactNode;
    editor: ReactNode;
    action: ReactNode;
    closeAction: ReactNode;
  }) => ReactNode;
  draft?: RecommendationDraft;
  conflict?: RecommendationConflict | null;
  draftReset?: number;
  onDraftChange: (draft: RecommendationDraft | undefined) => void;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
  onSave: SaveRecommendation;
};

export const RecommendationEditor = (props: RecommendationEditorProps) => {
  const {
    application,
    round,
    disabled,
    ready = true,
    showActionLabel = false,
    draft,
    conflict = null,
    draftReset = 0,
    onDraftChange,
    onKeepDraft,
    onLoadLatest,
    onSave,
    onClose,
    children,
  } = props;
  const { t } = useTranslation("fundingRecommendations");
  const withdrawn = !canChangeRecommendation(application);
  const { editButton, markRestoreFocus } = useRecommendationFocus();
  const editor = useRecommendationEditor({
    application,
    ready,
    draft,
    onDraftChange,
    onSave,
    onClose: async () => {
      markRestoreFocus();
      await onClose?.();
    },
  });

  const action = (
    <RecommendationAction
      application={application}
      disabled={disabled || withdrawn}
      showActionLabel={showActionLabel}
      canResume={editor.canResume}
      isOpen={editor.isOpen}
      ref={editButton}
      onOpen={editor.open}
    />
  );
  const summary = (
    <RecommendationSummaryContent
      recommendation={application.managerRecommendation}
      manager={round.manager}
    />
  );
  const closeAction = (
    <EditorClose
      label={t("editor.close")}
      onClose={() => void editor.close()}
      autoFocus={!ready || !draft}
      isDisabled={editor.isSaving}
      iconOnly
    />
  );
  const writingProps = {
    isOpen: editor.isOpen,
    withdrawn,
    ready,
    draft,
    conflict,
    draftReset,
    application,
    round,
    onDraftChange,
    onKeepDraft,
    onLoadLatest,
    onSave: editor.save,
    close: editor.close,
  };

  if (children) {
    return children({
      summary,
      action,
      closeAction,
      editor: renderRecommendationWriting({ ...writingProps, closeAction: null }),
    });
  }
  return (
    <RecommendationSection
      action={action}
      summary={summary}
      editor={renderRecommendationWriting({ ...writingProps, closeAction })}
    />
  );
};

const renderRecommendationWriting = ({
  isOpen,
  withdrawn,
  ...props
}: Omit<RecommendationFormProps, "initialDraft"> & {
  isOpen: boolean;
  withdrawn: boolean;
  ready: boolean;
  draft?: RecommendationDraft;
  closeAction: ReactNode;
}): ReactNode => (isOpen && !withdrawn ? <RecommendationWriting {...props} /> : null);

const RecommendationSummaryContent = ({
  recommendation,
  manager,
}: {
  recommendation: Application["managerRecommendation"];
  manager: ApplicationRoundContext["manager"];
}) => {
  const { t } = useTranslation("fundingRecommendations");
  return recommendation ? (
    <RecommendationSummary recommendation={recommendation} manager={manager} />
  ) : (
    <Text as="p" variant="missing">
      {t("applications.notRecommended")}
    </Text>
  );
};

const RecommendationSection = ({
  action,
  summary,
  editor,
}: {
  action: ReactNode;
  summary: ReactNode;
  editor: ReactNode;
}) => {
  const { t } = useTranslation("fundingRecommendations");
  return (
    <>
      <div className={localStyles.header}>
        <SectionHeader title={t("applications.recommendation")} aside={action} />
      </div>
      {summary}
      {editor}
    </>
  );
};

const useRecommendationFocus = () => {
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (restoreFocus.current && editButton.current) {
      editButton.current.focus();
      restoreFocus.current = false;
    }
  });

  return {
    editButton,
    markRestoreFocus: () => {
      restoreFocus.current = true;
    },
  };
};

const RecommendationWriting = ({
  ready,
  draft,
  draftReset = 0,
  closeAction,
  ...props
}: Omit<RecommendationFormProps, "initialDraft"> & {
  ready: boolean;
  draft?: RecommendationDraft;
  draftReset?: number;
  closeAction: ReactNode;
}) => {
  const { t } = useTranslation("fundingRecommendations");
  if (!ready || !draft) {
    return (
      <DialogContent label={t("editor.openFor", { title: props.application.title })}>
        <EditorLoading />
        {closeAction}
      </DialogContent>
    );
  }
  return <RecommendationForm key={draftReset} {...props} initialDraft={draft} />;
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
    <span className={isOpen ? localStyles.editingAction : undefined}>
      <Tooltip content={t(labels.tooltip)}>
        <Button
          iconOnly={!showLabel}
          data-draft={canResume || undefined}
          ref={ref}
          variant={preparingDeferral ? "secondary" : "quiet"}
          isDisabled={disabled}
          aria-label={t(labels.accessible, { title })}
          onPress={onOpen}
        >
          {!preparingDeferral && <Icon name="edit" />}
          {showLabel && t(labels.text)}
        </Button>
      </Tooltip>
    </span>
  );
};

type RecommendationFormProps = {
  application: Application;
  round: ApplicationRoundContext;
  initialDraft: RecommendationDraft;
  conflict?: RecommendationConflict | null;
  onDraftChange: (draft: RecommendationDraft) => void;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
  onSave: SaveRecommendation;
  close: (discard?: boolean) => Promise<void>;
};

const RecommendationConflictNotice = ({
  conflict,
  application,
  round,
  isDisabled,
  onKeepDraft,
  onLoadLatest,
}: {
  conflict: "basis_changed" | "record_changed";
  application: RecommendationEditorProps["application"];
  round: RecommendationEditorProps["round"];
  isDisabled: boolean;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
}) => {
  const { t } = useTranslation(["fundingRecommendations"]);
  const saved = application.managerRecommendation;
  const keepLabel =
    conflict === "basis_changed"
      ? t("editor.reaffirmDraft", { version: application.version })
      : t("editor.keepDraft");

  return (
    <ConflictBanner
      title={
        conflict === "basis_changed"
          ? t("editor.basisConflictTitle", { version: application.version })
          : t("editor.recordConflictTitle")
      }
      message={
        conflict === "basis_changed"
          ? t("editor.basisConflictMessage")
          : t("editor.recordConflictMessage")
      }
      keepMine={onKeepDraft ? { label: keepLabel, onPress: onKeepDraft } : undefined}
      useSaved={onLoadLatest ? { label: t("editor.loadSaved"), onPress: onLoadLatest } : undefined}
      isDisabled={isDisabled}
      latest={
        saved
          ? {
              toggleLabel: t("editor.viewLatest"),
              hideLabel: t("editor.hideLatest"),
              heading: t("editor.latestSaved"),
              children: <RecommendationSummary recommendation={saved} manager={round.manager} />,
            }
          : undefined
      }
    />
  );
};

const RecommendationForm = ({
  application,
  round,
  initialDraft,
  conflict = null,
  onDraftChange,
  onKeepDraft,
  onLoadLatest,
  onSave,
  close,
}: RecommendationFormProps) => {
  const { t } = useTranslation(["fundingRecommendations", "common"]);
  const { title } = application;
  const formSchema = recommendationFormSchema(t);

  const { form, submission } = useForm({
    defaultValues: initialDraft,
    schema: useTranslatedSchema(formSchema),
    onChange: onDraftChange,
    submitErrorMessage: t("editor.saveError"),
    onSubmit: async (value) => {
      if (conflict) {
        return recommendationSaveError(t, { status: "conflict" });
      }
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
          isSubmitDisabled={Boolean(conflict)}
        />
      }
    >
      <Stack gap={5}>
        {conflict && (
          <RecommendationConflictNotice
            conflict={conflict}
            application={application}
            round={round}
            isDisabled={submission.isSubmitting}
            onKeepDraft={onKeepDraft}
            onLoadLatest={onLoadLatest}
          />
        )}
        {application.intakeStatus === "in_preparation" && <p>{t("intake.fundingNotReady")}</p>}
        <AllocationFields form={form} />
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

const AllocationFields = ({ form }: { form: RecommendationFormModel }) => {
  const { t } = useTranslation(["fundingRecommendations", "common"]);
  return (
    <div className={localStyles.allocationFields}>
      <form.Field name="position">
        {(field) => (
          <FormSelect
            field={field}
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
                <FormMoneyField
                  field={field}
                  label={t("editor.amount")}
                  isRequired
                  prefix={{ text: "€", label: t("common:euros") }}
                  precisionMessage={t("validation.amountPrecision")}
                  description={
                    position === "Fund with a condition" ? t("editor.conditionalHint") : undefined
                  }
                />
              )}
            </form.Field>
          )
        }
      </form.Subscribe>
    </div>
  );
};

const BudgetFigure = ({
  label,
  amount,
  isOver = false,
}: {
  label: string;
  amount: string;
  isOver?: boolean;
}) => (
  <DescriptionList layout="figures">
    <DescriptionListItem label={label}>
      <Text as="strong" variant={isOver ? "attention" : "emphasis"}>
        {amount}
      </Text>
    </DescriptionListItem>
  </DescriptionList>
);

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
    <div className={localStyles.budgetContext}>
      <Stack gap={2}>
        <BudgetFigure
          label={t("editor.availableBefore")}
          amount={
            available.ok && available.totals.remaining !== null
              ? money(available.totals.remaining)
              : "—"
          }
        />
        {round.totals.withdrawnApplications > 0 && (
          <Text as="p" variant="caption">
            {t("editor.withdrawnNotCounted", { count: round.totals.withdrawnApplications })}
          </Text>
        )}
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
            const over =
              preview?.ok &&
              preview.totals.remaining !== null &&
              isNegative(preview.totals.remaining);

            return (
              <div role="status" aria-label={t("editor.budgetPreview")}>
                <BudgetFigure
                  label={t(over ? "editor.previewOver" : "editor.previewRemaining")}
                  amount={
                    preview?.ok && preview.totals.remaining !== null
                      ? money(absolute(preview.totals.remaining))
                      : "—"
                  }
                  isOver={over}
                />
              </div>
            );
          }}
        </form.Subscribe>
      </Stack>
    </div>
  );
};
