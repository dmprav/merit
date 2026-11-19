import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ConflictBanner, FormDialog } from "@merit/forms";
import { useLocaleSettings } from "@merit/i18n";
import { useFormat } from "@merit/i18n/format";
import { decodeMoney } from "@merit/money";
import { RemotePagedContent } from "@merit/query/pages";
import { ActionMenu } from "@merit/ui/action-menu";
import { ActionProvenance } from "@merit/ui/action-provenance";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { ChoiceList } from "@merit/ui/choice-list";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DateChoice } from "@merit/ui/date-choice";
import { DialogContent, PickerPopover } from "@merit/ui/dialog";
import { EditorLoading, EditorClose } from "@merit/ui/editor-loading";
import { Icon } from "@merit/ui/icon";
import { InlineName } from "@merit/ui/inline-name";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PagedContent } from "@merit/ui/paged-content";
import { PersonIdentity } from "@merit/ui/person-identity";
import { PropertyButton } from "@merit/ui/property-button";
import { StatusMessage } from "@merit/ui/status-message";
import { Tooltip } from "@merit/ui/tooltip";

import type { PreparationRound } from "../../contracts/preparation";
import {
  hasPreparationDraft,
  hasPreparationSectionConflict,
  type PreparationSection,
} from "../../controllers/preparation/preparation-state";
import { preparationError } from "./messages";
import { PreparationForm } from "./preparation-form";
import styles from "./preparation.module.css";
import type { PreparationEditing } from "./use-preparation-editing";

type Props = { preparation: PreparationEditing };

export const RoundEditButton = ({
  preparation,
  section,
  value,
  valueText,
}: {
  preparation: Pick<PreparationEditing, "draftFor" | "pending" | "open" | "registerEditTrigger">;
  section: Exclude<PreparationSection, "title">;
  value?: ReactNode;
  valueText?: string;
}) => {
  const { t } = useTranslation("roundPreparation");
  const draft = preparation.draftFor(section);
  const changed = draft && hasPreparationDraft(draft);
  const label = changed ? t(`preparation.resume.${section}`) : t(`preparation.edit.${section}`);
  if (value != null) {
    return (
      <PropertyButton
        ref={(element) => preparation.registerEditTrigger(section, element)}
        action={section === "manager" || section === "meetingDate" ? "choose" : "edit"}
        label={valueText ? t("preparation.editValue", { action: label, value: valueText }) : label}
        draftLabel={changed ? t("preparation.unsaved") : undefined}
        isDisabled={preparation.pending}
        onPress={() => preparation.open(section)}
      >
        {value}
      </PropertyButton>
    );
  }

  return (
    <Tooltip content={label}>
      <Button
        ref={(element) => preparation.registerEditTrigger(section, element)}
        size="small"
        variant="quiet"
        iconOnly
        data-draft={changed || undefined}
        aria-label={label}
        isDisabled={preparation.pending}
        onPress={() => preparation.open(section)}
      >
        <Icon name="edit" />
      </Button>
    </Tooltip>
  );
};

const LatestSectionValue = ({
  section,
  round,
}: {
  section: "purpose" | "criteria" | "budget";
  round: Pick<PreparationRound, "purpose" | "criteria" | "budget">;
}) => {
  const { t } = useTranslation("roundPreparation");
  const { money } = useFormat();

  switch (section) {
    case "purpose":
      return <p>{round.purpose || t("preparation.purposeUnset")}</p>;
    case "criteria":
      return round.criteria.length ? (
        <ol>
          {round.criteria.map((criterion) => (
            <li key={criterion.id}>
              <strong>{criterion.title}</strong>
              {criterion.description && <p>{criterion.description}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p>{t("round.noCriteria")}</p>
      );
    case "budget":
      return <p>{round.budget === null ? t("preparation.notSet") : money(round.budget)}</p>;
  }
};

export const RoundConflictBanner = ({
  section,
  round,
  onKeepMine,
  onUseSaved,
  isDisabled = false,
}: {
  section: "purpose" | "criteria" | "budget";
  round: Pick<PreparationRound, "purpose" | "criteria" | "budget">;
  onKeepMine: () => void;
  onUseSaved: () => void;
  isDisabled?: boolean;
}) => {
  const { t } = useTranslation("roundPreparation");

  return (
    <ConflictBanner
      title={t("preparation.conflictTitle")}
      message={t("preparation.conflictMessage")}
      keepMine={{ label: t("preparation.keepMine"), onPress: onKeepMine }}
      useSaved={{ label: t("preparation.useSaved"), onPress: onUseSaved }}
      isDisabled={isDisabled}
      latest={{
        toggleLabel: t("preparation.viewLatest"),
        hideLabel: t("preparation.hideLatest"),
        heading: t("preparation.latestSaved"),
        children: <LatestSectionValue section={section} round={round} />,
      }}
    />
  );
};

export const RoundEditor = ({
  preparation,
  section,
}: Props & { section: "purpose" | "criteria" | "budget" }) => {
  const { t } = useTranslation(["roundPreparation", "common"]);
  const { round } = preparation;
  const draft = preparation.draftFor(section);
  const { criteriaImpact } = round;

  if (!preparation.ready || !draft) {
    const loading = <EditorLoading />;
    return section === "budget" ? (
      <DialogContent label={t("preparation.edit.budget")}>{loading}</DialogContent>
    ) : (
      <div>
        <h3>{t(`preparation.edit.${section}`)}</h3>
        {loading}
        <EditorClose label={t("preparation.close")} onClose={() => preparation.close()} />
      </div>
    );
  }

  const isConflict =
    draft.revision !== preparation.revision && hasPreparationSectionConflict(draft, round);

  return (
    <>
      {section === "criteria" &&
        (criteriaImpact.assessments > 0 || criteriaImpact.requests > 0) && (
          <Notice appearance="inline" tone="warning">
            {t("preparation.criteriaImpact", criteriaImpact)}
          </Notice>
        )}
      {draft && (
        <PreparationForm
          key={`${section}/${draft.revision}`}
          draft={draft}
          round={round}
          budgetPreviouslySet={preparation.budgetHistory.length > 0}
          isConflict={isConflict}
          beforeFields={
            isConflict && (
              <RoundConflictBanner
                section={section}
                round={round}
                isDisabled={preparation.pending}
                onKeepMine={() => preparation.keepDraft(section)}
                onUseSaved={() => preparation.loadLatest(section)}
              />
            )
          }
          onChange={(value) => preparation.updateDraft(value)}
          onCancel={preparation.close}
          onDiscard={() => preparation.discard(section)}
          inline={section === "purpose" || section === "criteria"}
          onSave={async (draft) => preparationError(t, await preparation.saveDraft(draft))}
          afterFields={
            section === "budget" &&
            preparation.budgetHistory.length > 0 && <BudgetHistory preparation={preparation} />
          }
        />
      )}
    </>
  );
};

export const RoundTitle = ({
  preparation,
}: {
  preparation: Pick<PreparationEditing, "round" | "pending" | "renameRound" | "ready">;
}) => {
  const { t } = useTranslation(["roundPreparation", "common"]);

  return (
    <InlineName
      value={preparation.round.title}
      label={t("preparation.edit.title")}
      saveLabel={t("preparation.saveName")}
      cancelLabel={t("common:cancel")}
      errorMessage={t("preparation.saveError")}
      isPreparing={!preparation.ready}
      isDisabled={preparation.pending}
      onSave={async (title) => preparationError(t, await preparation.renameRound(title))}
    />
  );
};

export const RoundBudget = ({ preparation }: Props) => {
  const { t } = useTranslation("roundPreparation");
  const { money } = useFormat();
  const value =
    preparation.round.budget === null ? t("preparation.notSet") : money(preparation.round.budget);

  return (
    <FormDialog
      title={t("preparation.edit.budget")}
      trigger={
        <RoundEditButton
          preparation={preparation}
          section="budget"
          value={value}
          valueText={value}
        />
      }
      isOpen={preparation.editing === "budget"}
      isDismissDisabled={preparation.pending}
      onOpenChange={(open) =>
        open ? preparation.open("budget") : preparation.close({ restoreFocus: false })
      }
    >
      <RoundEditor preparation={preparation} section="budget" />
    </FormDialog>
  );
};

export const RoundDate = ({
  preparation,
}: {
  preparation: QuickEditorState & Pick<PreparationEditing, "round" | "changeMeetingDate">;
}) => {
  const { t } = useTranslation(["roundPreparation", "common"]);
  const { calendarDate } = useFormat();
  const { round, pending } = preparation;
  const value = round.meetingDate ? calendarDate(round.meetingDate) : t("preparation.notScheduled");

  return (
    <QuickEditor preparation={preparation} section="meetingDate" value={value} valueText={value}>
      <DateChoice
        applyLabel={t("preparation.saveDate")}
        cancelLabel={t("common:cancel")}
        onCancel={preparation.close}
        value={round.meetingDate}
        label={t("round.committeeDate")}
        clearLabel={t("preparation.clearDate")}
        invalidMessage={t("preparation.dateInvalid")}
        isDisabled={pending}
        onChoose={(meetingDate) => void preparation.changeMeetingDate(meetingDate)}
      />
    </QuickEditor>
  );
};

export const RoundManager = ({
  preparation,
}: {
  preparation: QuickEditorState & Pick<PreparationEditing, "round" | "managers" | "assignManager">;
}) => {
  const { t } = useTranslation("roundPreparation");
  const { round, pending, managers } = preparation;
  const name = round.manager.trim();
  const valueText =
    name ||
    t(round.managerNeedsReassignment ? "preparation.unassigned" : "preparation.unknownPerson");

  return (
    <QuickEditor
      preparation={preparation}
      section="manager"
      value={<PersonIdentity name={valueText} isPlaceholder={!name} />}
      valueText={valueText}
    >
      {({ closeButton }) => (
        <ChoiceList
          headerActions={closeButton}
          label={t("preparation.chooseManager")}
          searchLabel={t("preparation.searchPeople")}
          emptyLabel={t("preparation.noPeople")}
          selectedKey={round.managerUserId ?? null}
          isDisabled={pending}
          items={managers.map((manager) => ({
            id: manager.userId,
            label: manager.name ?? manager.email ?? t("preparation.unknownPerson"),
            description: manager.name ? (manager.email ?? undefined) : undefined,
          }))}
          onChoose={(userId) => void preparation.assignManager(userId)}
        />
      )}
    </QuickEditor>
  );
};

type QuickEditorState = Pick<
  PreparationEditing,
  "draftFor" | "pending" | "open" | "close" | "editing" | "error" | "registerEditTrigger" | "ready"
>;

const QuickEditor = ({
  preparation,
  section,
  value,
  valueText,
  children,
}: {
  preparation: QuickEditorState;
  section: "meetingDate" | "manager";
  value: ReactNode;
  valueText: string;
  children: ReactNode | ((props: { closeButton: ReactNode }) => ReactNode);
}) => {
  const { t } = useTranslation("roundPreparation");

  return (
    <PickerPopover
      title={t(`preparation.edit.${section}`)}
      placement="left top"
      trigger={
        <RoundEditButton
          preparation={preparation}
          section={section}
          value={value}
          valueText={valueText}
        />
      }
      isOpen={preparation.editing === section}
      isDismissDisabled={preparation.pending}
      onOpenChange={(open) =>
        open ? preparation.open(section) : preparation.close({ restoreFocus: false })
      }
    >
      {({ closeButton }) => (
        <>
          {!preparation.ready ? (
            <DialogContent label={t(`preparation.edit.${section}`)}>
              <Inline justify="between">
                <h3>{t(`preparation.edit.${section}`)}</h3>
                {closeButton}
              </Inline>
              <EditorLoading />
            </DialogContent>
          ) : typeof children === "function" ? (
            children({ closeButton })
          ) : (
            children
          )}
          {preparation.error && (
            <Notice tone="danger" role="alert">
              {preparationError(t, preparation.error)}
            </Notice>
          )}
        </>
      )}
    </PickerPopover>
  );
};

export const RoundActions = ({
  hasApplications,
  pending,
  onDelete,
  triggerRef,
}: {
  hasApplications: boolean;
  pending: boolean;
  onDelete: () => void;
  triggerRef: (element: HTMLButtonElement | null) => void;
}) => {
  const { t } = useTranslation("roundPreparation");
  if (hasApplications) {
    return null;
  }

  return (
    <div className={styles.actions}>
      <ActionMenu
        label={t("preparation.moreActions")}
        trigger={
          <Button ref={triggerRef} size="small" variant="quiet" isDisabled={pending}>
            {t("preparation.moreActions")}
          </Button>
        }
        items={[{ id: "delete", label: t("preparation.delete") }]}
        onAction={onDelete}
      />
    </div>
  );
};

export const RoundDeleteConfirmation = ({ preparation }: Props) => {
  const { t } = useTranslation(["roundPreparation", "common"]);
  if (preparation.round.applicationCount) {
    return null;
  }

  return (
    <ConfirmationDialog
      title={t("preparation.deleteTitle")}
      description={t("preparation.deleteDescription", { title: preparation.round.title })}
      cancelLabel={t("common:cancel")}
      confirmLabel={t("preparation.delete")}
      pendingLabel={t("preparation.deleting")}
      intent="destructive"
      isOpen={preparation.deleting}
      onOpenChange={preparation.setDeleting}
      isPending={preparation.pending}
      error={preparationError(t, preparation.deleteError, "delete")}
      onConfirm={preparation.confirmDelete}
    />
  );
};

export const RoundFeedback = ({ preparation }: Props) => {
  const { t } = useTranslation("roundPreparation");
  const { undo, feedback, pending, refreshError } = preparation;

  return (
    <>
      <StatusMessage
        confirmation={!undo}
        className={shellStyles.confirmation}
        eventId={feedback.event}
        message={
          feedback.outcome
            ? t(feedback.outcome === "saved" ? "preparation.saved" : "preparation.undone")
            : null
        }
      />
      {undo && (
        <div className={styles.undo}>
          <span>{t("preparation.saved")}</span>
          <Button
            size="small"
            variant="quiet"
            isDisabled={pending}
            onPress={() => {
              void preparation.undoSave();
            }}
          >
            {t("preparation.undo")}
          </Button>
          <Button
            size="small"
            variant="quiet"
            iconOnly
            aria-label={t("preparation.close")}
            onPress={() => preparation.dismissUndo()}
          >
            <Icon name="close" />
          </Button>
          {preparation.error && <span role="alert">{preparationError(t, preparation.error)}</span>}
        </div>
      )}
      {refreshError && (
        <Notice as="div" tone="warning">
          <p>
            {t(
              refreshError === "saved"
                ? "preparation.refreshError"
                : "preparation.refreshReadError",
            )}
          </p>
          <Button
            size="small"
            variant="secondary"
            onPress={() => {
              void preparation.refresh(refreshError);
            }}
          >
            {t("preparation.refresh")}
          </Button>
        </Notice>
      )}
    </>
  );
};

const BudgetHistory = ({ preparation }: Props) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(["roundPreparation", "common"]);
  const { formatLocale } = useLocaleSettings();
  const { money } = useFormat();
  return (
    <details className={styles.history} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t("preparation.budgetHistory")}</summary>
      <RemotePagedContent
        source={preparation.historySource}
        entries={preparation.budgetHistory}
        active={open}
      >
        {(page) => (
          <PagedContent {...page}>
            {(entries) => (
              <ol>
                {entries.map((entry) => (
                  <li key={entry.revision}>
                    <p>
                      {t("preparation.budgetTransition", {
                        before:
                          entry.before === null
                            ? t("preparation.notSet")
                            : money(decodeMoney(entry.before)),
                        after:
                          entry.after === null
                            ? t("preparation.notSet")
                            : money(decodeMoney(entry.after)),
                      })}
                    </p>
                    <p>{entry.reason}</p>
                    <Inline align="baseline" gap={3}>
                      <span>
                        {t("common:recordedBy", {
                          name: entry.actor ?? t("preparation.unknownPerson"),
                        })}
                      </span>
                      <ActionProvenance value={entry.provenance} />
                      <time dateTime={entry.recordedAt}>
                        {new Date(entry.recordedAt).toLocaleString(formatLocale, {
                          timeZone: "UTC",
                        })}{" "}
                        UTC
                      </time>
                    </Inline>
                  </li>
                ))}
              </ol>
            )}
          </PagedContent>
        )}
      </RemotePagedContent>
    </details>
  );
};
