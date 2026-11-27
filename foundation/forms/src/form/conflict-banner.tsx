import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { showToast } from "@merit/ui/toast";

import styles from "./conflict-banner.module.css";

export type ConflictAction = {
  label: string;
  onPress: () => void;
};

export type ConflictLatestPreview = {
  toggleLabel: string;
  hideLabel: string;
  heading?: string;
  children: ReactNode;
};

/**
 * Explains a save or basis conflict above an editable form while keeping
 * any saved-content preview outside the warning notice container.
 */
export const ConflictBanner = ({
  title,
  message,
  attribution,
  keepMine,
  useSaved,
  latest,
  isDisabled = false,
}: {
  title: string;
  message: ReactNode;
  attribution?: ReactNode;
  keepMine?: ConflictAction;
  useSaved?: ConflictAction;
  latest?: ConflictLatestPreview;
  isDisabled?: boolean;
}) => {
  const [showLatest, setShowLatest] = useState(false);
  const hasActions = Boolean(keepMine || useSaved || latest);

  return (
    <div className={styles.banner}>
      <Notice
        as="div"
        appearance="inline"
        tone="warning"
        role="alert"
        title={title}
        actions={
          hasActions && (
            <ConflictActions
              keepMine={keepMine}
              useSaved={useSaved}
              latest={latest}
              isDisabled={isDisabled}
              showLatest={showLatest}
              onToggleLatest={() => setShowLatest((open) => !open)}
            />
          )
        }
      >
        <p>{message}</p>
        {attribution && <p className={styles.attribution}>{attribution}</p>}
      </Notice>
      {latest && showLatest && (
        <section className={styles.latest} aria-label={latest.heading ?? latest.toggleLabel}>
          {latest.heading && <p className={styles.latestHeading}>{latest.heading}</p>}
          {latest.children}
        </section>
      )}
    </div>
  );
};

/** Only the first action is outdented, so its text starts on the banner's text edge. */
const ConflictActions = ({
  keepMine,
  useSaved,
  latest,
  isDisabled,
  showLatest,
  onToggleLatest,
}: {
  keepMine?: ConflictAction;
  useSaved?: ConflictAction;
  latest?: ConflictLatestPreview;
  isDisabled: boolean;
  showLatest: boolean;
  onToggleLatest: () => void;
}) => {
  return (
    <Inline>
      {keepMine && (
        <Button
          variant="quiet"
          alignment="start"
          isDisabled={isDisabled}
          onPress={keepMine.onPress}
        >
          {keepMine.label}
        </Button>
      )}
      {useSaved && (
        <Button
          variant="quiet"
          alignment={keepMine ? undefined : "start"}
          isDisabled={isDisabled}
          onPress={useSaved.onPress}
        >
          {useSaved.label}
        </Button>
      )}
      {latest && (
        <Button
          variant="quiet"
          alignment={keepMine || useSaved ? undefined : "start"}
          aria-expanded={showLatest}
          onPress={onToggleLatest}
        >
          {showLatest ? latest.hideLabel : latest.toggleLabel}
        </Button>
      )}
    </Inline>
  );
};

/**
 * Under a field whose draft differs from the latest saved version: the saved value, so the person
 * compares it where they edit instead of in a separate panel. Place it after the field's control.
 */
export const SavedValue = ({ label, children }: { label: string; children: ReactNode }) => (
  <p className={styles.savedValue}>
    <span className={styles.savedLabel}>{label}</span> {children}
  </p>
);

const RetainedDraftActions = ({
  copyLabel,
  copyingLabel,
  discardLabel,
  copying,
  isDisabled,
  onCopy,
  onDiscard,
}: {
  copyLabel: string;
  copyingLabel: string;
  discardLabel: string;
  copying: boolean;
  isDisabled: boolean;
  onCopy: () => void;
  onDiscard?: () => void;
}) => (
  <Inline>
    <Button variant="quiet" isDisabled={isDisabled || copying} onPress={onCopy}>
      {copying ? copyingLabel : copyLabel}
    </Button>
    {onDiscard && (
      <Button variant="quiet" isDisabled={isDisabled} onPress={onDiscard}>
        {discardLabel}
      </Button>
    )}
  </Inline>
);

const useRetainedDraftLabels = (labels: {
  copyLabel?: string;
  copyingLabel?: string;
  copiedLabel?: string;
  copyFailedLabel?: string;
  discardLabel?: string;
}) => {
  const { t } = useTranslation("common");
  return {
    copyLabel: labels.copyLabel ?? t("retainedDraft.copy", { defaultValue: "Copy draft" }),
    copyingLabel: labels.copyingLabel ?? t("retainedDraft.copying", { defaultValue: "Copying…" }),
    copiedLabel: labels.copiedLabel ?? t("retainedDraft.copied", { defaultValue: "Draft copied" }),
    copyFailedLabel:
      labels.copyFailedLabel ??
      t("retainedDraft.copyFailed", { defaultValue: "Could not copy draft." }),
    discardLabel:
      labels.discardLabel ?? t("retainedDraft.discard", { defaultValue: "Discard draft" }),
  };
};

/**
 * Preserves unsaved writing when an editor can no longer save (access lost,
 * record deleted, or withdrawn) so the author can copy it out or discard it.
 */
export const RetainedDraftNotice = ({
  title,
  message,
  copyLabel,
  copyingLabel,
  copiedLabel,
  copyFailedLabel,
  discardLabel,
  textToCopy,
  onDiscard,
  isDisabled = false,
  children,
}: {
  title: string;
  message: ReactNode;
  copyLabel?: string;
  copyingLabel?: string;
  copiedLabel?: string;
  copyFailedLabel?: string;
  discardLabel?: string;
  textToCopy: string;
  onDiscard?: () => void;
  isDisabled?: boolean;
  children?: ReactNode;
}) => {
  const labels = useRetainedDraftLabels({
    copyLabel,
    copyingLabel,
    copiedLabel,
    copyFailedLabel,
    discardLabel,
  });
  const [copying, setCopying] = useState(false);

  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast({ tone: "success", message: labels.copiedLabel });
    } catch {
      showToast({ tone: "danger", message: labels.copyFailedLabel });
    }
    setCopying(false);
  };

  return (
    <section className={styles.banner} aria-label={title}>
      <Notice
        as="div"
        appearance="inline"
        tone="warning"
        title={title}
        actions={
          <RetainedDraftActions
            copyLabel={labels.copyLabel}
            copyingLabel={labels.copyingLabel}
            discardLabel={labels.discardLabel}
            copying={copying}
            isDisabled={isDisabled}
            onCopy={() => void copy()}
            onDiscard={onDiscard}
          />
        }
      >
        <p>{message}</p>
      </Notice>
      {children && <div className={styles.retainedContent}>{children}</div>}
    </section>
  );
};
