import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { Inline } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { StatusMessage } from "@merit/ui/status-message";

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

  return (
    <div className={styles.banner}>
      <Notice
        as="div"
        appearance="inline"
        tone="warning"
        role="alert"
        title={title}
        actions={
          (keepMine || useSaved || latest) && (
            <Inline>
              {keepMine && (
                <Button
                  size="small"
                  variant="secondary"
                  isDisabled={isDisabled}
                  onPress={keepMine.onPress}
                >
                  {keepMine.label}
                </Button>
              )}
              {useSaved && (
                <Button
                  size="small"
                  variant="secondary"
                  isDisabled={isDisabled}
                  onPress={useSaved.onPress}
                >
                  {useSaved.label}
                </Button>
              )}
              {latest && (
                <Button
                  size="small"
                  variant="quiet"
                  aria-expanded={showLatest}
                  onPress={() => setShowLatest((open) => !open)}
                >
                  {showLatest ? latest.hideLabel : latest.toggleLabel}
                </Button>
              )}
            </Inline>
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
    <Button size="small" variant="secondary" isDisabled={isDisabled || copying} onPress={onCopy}>
      {copying ? copyingLabel : copyLabel}
    </Button>
    {onDiscard && (
      <Button size="small" variant="quiet" isDisabled={isDisabled} onPress={onDiscard}>
        {discardLabel}
      </Button>
    )}
  </Inline>
);

const CopyStatusFeedback = ({
  copying,
  copyFailed,
  copied,
  copiedLabel,
  copyFailedLabel,
}: {
  copying: boolean;
  copyFailed: boolean;
  copied: number;
  copiedLabel: string;
  copyFailedLabel: string;
}) => (
  <>
    {copyFailed && (
      <Notice appearance="inline" tone="danger" role="alert">
        {copyFailedLabel}
      </Notice>
    )}
    <StatusMessage
      message={copied > 0 && !copying && !copyFailed ? copiedLabel : null}
      eventId={copied}
      confirmation
      className={shellStyles.confirmation}
    />
  </>
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
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(0);

  const copy = async () => {
    setCopying(true);
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied((count) => count + 1);
    } catch {
      setCopyFailed(true);
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
      <CopyStatusFeedback
        copying={copying}
        copyFailed={copyFailed}
        copied={copied}
        copiedLabel={labels.copiedLabel}
        copyFailedLabel={labels.copyFailedLabel}
      />
      {children && <div className={styles.retainedContent}>{children}</div>}
    </section>
  );
};
