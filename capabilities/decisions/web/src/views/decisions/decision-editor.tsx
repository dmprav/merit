import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import {
  canChangeDecision,
  commitsFunding,
  decisionLimits,
  decisionOutcomes,
  previewCommitment,
  type DecisionVersion,
} from "@merit/decisions/domain";
import {
  ConflictBanner,
  Form,
  FormActions,
  FormDateField,
  FormMoneyField,
  FormSelect,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import type { ApplicationRoundContext } from "@merit/grantmaking/api";
import type { ApplicationView as Application } from "@merit/grantmaking/api";
import { useFormat } from "@merit/i18n/format";
import { fromMinorUnits } from "@merit/money";
import { parseMoneyInput } from "@merit/money/input";
import { Button } from "@merit/ui/button";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { DialogContent } from "@merit/ui/dialog";
import { EditorClose, EditorLoading } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { Reading, Stack } from "@merit/ui/layout";
import { Panel } from "@merit/ui/panel";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
import { Tooltip } from "@merit/ui/tooltip";

import type { DecisionDraft, SaveDecision } from "../../contracts/decisions";
import type { DecisionConflict } from "../../controllers/decisions/use-decision";
import { useDecisionEditor } from "../../controllers/decisions/use-decision-editor";
import localStyles from "./decision-editor.module.css";
import { DecisionSummary } from "./decision-summary";
import { decisionFormSchema } from "./form-schema";
import { decisionOutcomeKeys, decisionSaveError, recommendationPositionKeys } from "./messages";

const zero = fromMinorUnits(0n);

type DecisionEditorProps = {
  application: Application;
  round: ApplicationRoundContext;
  versions: readonly DecisionVersion[];
  disabled: boolean;
  ready?: boolean;
  onClose?: () => void | Promise<void>;
  children?: (slots: {
    summary: ReactNode;
    editor: ReactNode;
    action: ReactNode;
    closeAction: ReactNode;
  }) => ReactNode;
  draft?: DecisionDraft;
  conflict?: DecisionConflict | null;
  draftReset?: number;
  onDraftChange: (draft: DecisionDraft | undefined) => void;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
  onSave: SaveDecision;
};

export const DecisionEditor = (props: DecisionEditorProps) => {
  const {
    application,
    round,
    versions,
    disabled,
    ready = true,
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
  const { t } = useTranslation("committeeDecisions");
  const withdrawn = !canChangeDecision(application);
  const { editButton, markRestoreFocus } = useDecisionFocus();
  const editor = useDecisionEditor({
    application,
    current: versions[0],
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
    <DecisionAction
      application={application}
      hasDecision={versions.length > 0}
      disabled={disabled || withdrawn}
      canResume={editor.canResume}
      isOpen={editor.isOpen}
      ref={editButton}
      onOpen={editor.open}
    />
  );
  const summary = <DecisionSummary versions={versions} />;
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
    versions,
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
      editor: renderDecisionWriting({ ...writingProps, closeAction: null }),
    });
  }
  return (
    <>
      <div className={localStyles.header}>
        <SectionHeader title={t("section.title")} aside={action} />
      </div>
      {summary}
      {renderDecisionWriting({ ...writingProps, closeAction })}
    </>
  );
};

const renderDecisionWriting = ({
  isOpen,
  withdrawn,
  ...props
}: Omit<DecisionFormProps, "initialDraft"> & {
  isOpen: boolean;
  withdrawn: boolean;
  ready: boolean;
  draft?: DecisionDraft;
  draftReset?: number;
  closeAction: ReactNode;
}): ReactNode => (isOpen && !withdrawn ? <DecisionWriting {...props} /> : null);

const useDecisionFocus = () => {
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

const DecisionWriting = ({
  ready,
  draft,
  draftReset = 0,
  closeAction,
  ...props
}: Omit<DecisionFormProps, "initialDraft"> & {
  ready: boolean;
  draft?: DecisionDraft;
  draftReset?: number;
  closeAction: ReactNode;
}) => {
  const { t } = useTranslation("committeeDecisions");
  if (!ready || !draft) {
    return (
      <DialogContent label={t("section.recordFor", { title: props.application.title })}>
        <EditorLoading />
        {closeAction}
      </DialogContent>
    );
  }
  return <DecisionForm key={draftReset} {...props} initialDraft={draft} />;
};

const DecisionAction = ({
  application,
  hasDecision,
  disabled,
  canResume,
  isOpen,
  ref,
  onOpen,
}: {
  application: Application;
  hasDecision: boolean;
  disabled: boolean;
  canResume: boolean;
  isOpen: boolean;
  ref: Ref<HTMLButtonElement>;
  onOpen: () => void;
}) => {
  const { t } = useTranslation("committeeDecisions");
  const { title } = application;
  const labels = canResume
    ? ({ text: "section.resume", accessible: "section.resumeFor" } as const)
    : hasDecision
      ? ({ text: "section.change", accessible: "section.changeFor" } as const)
      : ({ text: "section.record", accessible: "section.recordFor" } as const);

  return (
    <span className={isOpen ? localStyles.editingAction : undefined}>
      <Tooltip content={t(labels.text)}>
        <Button
          iconOnly
          data-draft={canResume || undefined}
          ref={ref}
          variant="quiet"
          isDisabled={disabled}
          aria-label={t(labels.accessible, { title })}
          onPress={onOpen}
        >
          <Icon name="edit" />
        </Button>
      </Tooltip>
    </span>
  );
};

type DecisionFormProps = {
  application: Application;
  round: ApplicationRoundContext;
  versions: readonly DecisionVersion[];
  initialDraft: DecisionDraft;
  conflict?: DecisionConflict | null;
  onDraftChange: (draft: DecisionDraft) => void;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
  onSave: SaveDecision;
  close: (discard?: boolean) => Promise<void>;
};

const DecisionConflictNotice = ({
  versions,
  isDisabled,
  onKeepDraft,
  onLoadLatest,
}: {
  versions: readonly DecisionVersion[];
  isDisabled: boolean;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
}) => {
  const { t } = useTranslation("committeeDecisions");
  return (
    <ConflictBanner
      title={t("editor.recordConflictTitle")}
      message={t("editor.recordConflictMessage")}
      keepMine={onKeepDraft ? { label: t("editor.keepDraft"), onPress: onKeepDraft } : undefined}
      useSaved={onLoadLatest ? { label: t("editor.loadSaved"), onPress: onLoadLatest } : undefined}
      isDisabled={isDisabled}
      latest={
        versions.length > 0
          ? {
              toggleLabel: t("editor.viewLatest"),
              hideLabel: t("editor.hideLatest"),
              heading: t("editor.latestSaved"),
              children: <DecisionSummary versions={versions} />,
            }
          : undefined
      }
    />
  );
};

const DecisionForm = ({
  application,
  round,
  versions,
  initialDraft,
  conflict = null,
  onDraftChange,
  onKeepDraft,
  onLoadLatest,
  onSave,
  close,
}: DecisionFormProps) => {
  const { t } = useTranslation(["committeeDecisions", "common"]);
  const amending = versions.length > 0;
  const formSchema = decisionFormSchema(t, amending);

  const { form, submission } = useForm({
    defaultValues: initialDraft,
    schema: useTranslatedSchema(formSchema),
    onChange: onDraftChange,
    submitErrorMessage: t("editor.saveError"),
    onSubmit: async (value) => {
      if (conflict) {
        return decisionSaveError(t, { status: "conflict" });
      }
      // Form validation does not apply schema transformations to submitted values.
      const failure = await onSave(formSchema.parse(value));
      if (!failure) {
        await close(true);
      }
      return decisionSaveError(t, failure);
    },
  });

  return (
    <Form
      submitOnModEnter
      submission={submission}
      scrollFields
      label={t("section.recordFor", { title: application.title })}
      actions={
        <FormActions
          submission={submission}
          onCancel={() => void close()}
          cancelLabel={t("editor.cancel")}
          discard={{ label: t("editor.discard"), onPress: () => void close(true) }}
          submitLabel={t("editor.save")}
          submittingLabel={t("editor.saving")}
          isSubmitDisabled={Boolean(conflict)}
        />
      }
    >
      <Stack gap={5}>
        {conflict && (
          <DecisionConflictNotice
            versions={versions}
            isDisabled={submission.isSubmitting}
            onKeepDraft={onKeepDraft}
            onLoadLatest={onLoadLatest}
          />
        )}
        {application.intakeStatus === "in_preparation" && <p>{t("editor.notReady")}</p>}
        <RecommendationComparison application={application} />
        <OutcomeFields form={form} />
        <JustificationFields form={form} amending={amending} />
        <DecisionBudget form={form} round={round} versions={versions} />
        <Text as="p" variant="caption">
          {t("editor.recordedByNote")}
        </Text>
      </Stack>
    </Form>
  );
};

type DecisionFormModel = ReturnType<typeof useForm<DecisionDraft>>["form"];

const JustificationFields = ({
  form,
  amending,
}: {
  form: DecisionFormModel;
  amending: boolean;
}) => {
  const { t } = useTranslation("committeeDecisions");
  return (
    <>
      <form.Field name="reason">
        {(field) => (
          <FormTextField
            field={field}
            label={t("editor.reason")}
            multiline
            rows={6}
            isRequired
            maxLength={decisionLimits.reasonLength}
          />
        )}
      </form.Field>
      <form.Field name="decidedBy">
        {(field) => (
          <FormTextField
            field={field}
            label={t("editor.decidedBy")}
            description={t("editor.decidedByHint")}
            isRequired
            maxLength={decisionLimits.decidedByLength}
          />
        )}
      </form.Field>
      <form.Field name="decisionDate">
        {(field) => <FormDateField field={field} label={t("editor.decisionDate")} isRequired />}
      </form.Field>
      {amending && (
        <form.Field name="changeExplanation">
          {(field) => (
            <FormTextField
              field={field}
              label={t("editor.changeExplanation")}
              description={t("editor.changeExplanationHint")}
              multiline
              rows={3}
              isRequired
              maxLength={decisionLimits.changeExplanationLength}
            />
          )}
        </form.Field>
      )}
    </>
  );
};

const RecommendationComparison = ({ application }: { application: Application }) => {
  const { t } = useTranslation("committeeDecisions");
  const { money } = useFormat();
  const recommendation = application.managerRecommendation;
  return (
    <Panel as="section" aria-label={t("comparison.title")}>
      <Stack gap={2}>
        <Text as="p" variant="caption">
          {t("comparison.title")}
        </Text>
        {recommendation ? (
          <>
            <Text as="p" variant="emphasis">
              {t(recommendationPositionKeys[recommendation.position])}
              {recommendation.position !== "Defer" &&
                ` · ${t("comparison.amount", { amount: money(recommendation.allocation) })}`}
            </Text>
            <Reading prose={false} as="p">
              {recommendation.reasoning}
            </Reading>
          </>
        ) : (
          <Text as="p" variant="missing">
            {t("comparison.none")}
          </Text>
        )}
      </Stack>
    </Panel>
  );
};

const OutcomeFields = ({ form }: { form: DecisionFormModel }) => {
  const { t } = useTranslation(["committeeDecisions", "common"]);
  return (
    <Stack gap={4}>
      <div className={localStyles.outcomeFields}>
        <form.Field name="outcome">
          {(field) => (
            <FormSelect
              field={field}
              label={t("editor.outcome")}
              isRequired
              autoFocus
              items={decisionOutcomes.map((outcome) => ({
                id: outcome,
                label: t(decisionOutcomeKeys[outcome]),
              }))}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.outcome}>
          {(outcome) =>
            commitsFunding(outcome) && (
              <form.Field name="amount">
                {(field) => (
                  <FormMoneyField
                    field={field}
                    label={t("editor.amount")}
                    isRequired
                    prefix={{ text: "€", label: t("common:euros") }}
                    precisionMessage={t("validation.amountPrecision")}
                    description={
                      outcome === "Fund with conditions" ? t("editor.conditionalHint") : undefined
                    }
                  />
                )}
              </form.Field>
            )
          }
        </form.Subscribe>
      </div>
      <form.Subscribe selector={(state) => state.values.outcome}>
        {(outcome) =>
          outcome === "Fund with conditions" && (
            <form.Field name="conditions">
              {(field) => (
                <FormTextField
                  field={field}
                  label={t("editor.conditions")}
                  multiline
                  rows={3}
                  isRequired
                  maxLength={decisionLimits.conditionsLength}
                />
              )}
            </form.Field>
          )
        }
      </form.Subscribe>
    </Stack>
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

const DecisionBudget = ({
  form,
  round,
  versions,
}: Pick<DecisionFormProps, "round" | "versions"> & { form: DecisionFormModel }) => {
  const { t } = useTranslation(["committeeDecisions", "common"]);
  const { money } = useFormat();
  const current = versions[0]?.decision ?? null;
  return (
    <div className={localStyles.budgetContext}>
      <Stack gap={2}>
        <BudgetFigure label={t("budget.committedBefore")} amount={money(round.totals.committed)} />
        <BudgetFigure
          label={t("budget.availableBefore")}
          amount={round.totals.available === null ? "—" : money(round.totals.available)}
        />
        {round.totals.withdrawnApplications > 0 && (
          <Text as="p" variant="caption">
            {t("budget.withdrawnNotCounted", { count: round.totals.withdrawnApplications })}
          </Text>
        )}
        <form.Subscribe selector={(state) => [state.values.outcome, state.values.amount] as const}>
          {([outcome, amount]) => {
            const next = commitsFunding(outcome) ? parseMoneyInput(amount) : zero;
            const preview =
              next === null
                ? null
                : previewCommitment(
                    { budget: round.budget, committed: round.totals.committed },
                    current,
                    { outcome, amount: next },
                  );
            const failure = preview && !preview.ok ? preview : null;
            const noBudget = failure?.error === "budget_required";
            const over = failure?.error === "commitment_exceeds_budget";
            const committed = preview?.ok
              ? preview.totals.committed
              : failure && "committed" in failure
                ? failure.committed
                : null;
            const available = preview?.ok ? preview.totals.available : null;

            return (
              <div role="status" aria-label={t("budget.preview")}>
                <Stack gap={2}>
                  <BudgetFigure
                    label={t("budget.committedAfter")}
                    amount={committed === null ? "—" : money(committed)}
                  />
                  {over && failure && "excess" in failure && failure.excess ? (
                    <BudgetFigure label={t("budget.over")} amount={money(failure.excess)} isOver />
                  ) : (
                    <BudgetFigure
                      label={t("budget.availableAfter")}
                      amount={available === null ? "—" : money(available)}
                    />
                  )}
                  {noBudget && (
                    <Text as="p" variant="attention">
                      {t("budget.noBudget")}
                    </Text>
                  )}
                </Stack>
              </div>
            );
          }}
        </form.Subscribe>
      </Stack>
    </div>
  );
};
