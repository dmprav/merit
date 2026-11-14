import { Link, useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";

import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { Icon } from "@merit/ui/icon";
import linkStyles from "@merit/ui/link.module.css";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";
import { StatusMessage } from "@merit/ui/status-message";
import { Tooltip } from "@merit/ui/tooltip";

import type { OrganizationData } from "../contracts";
import { useOrganization, type OrganizationController } from "../controllers/organization";
import { NameEditor, OwnerEditor } from "./organization-editors";
import styles from "./organization.module.css";
import { InvitationBadge, InvitationSummary, invitationNeedsAttention } from "./owner-invitation";

export const OrganizationDetailsView = ({ data }: { data: OrganizationData }) => {
  const { t } = useTranslation("administration");
  const hydrated = useHydrated();
  const [notice, setNotice] = useState({ message: null as string | null, key: 0 });

  const announce = (message: string) =>
    setNotice((previous) => ({ message, key: previous.key + 1 }));

  const { work, editNameAction, invitationAction, refreshAction, invitationSection } =
    useOrganizationDetails({
      data,
      onCommitted: (event) => announce(t(event)),
    });
  const {
    organization,
    name,
    invitation: invitationWork,
    busy,
    refreshing,
    refreshFailed: refreshProblem,
    refresh,
  } = work;
  const invitation = invitationWork.record;

  return (
    <>
      <PageHeader
        title={organization.name}
        status={<InvitationBadge invitation={invitation} hasOwner={organization.hasOwner} />}
        actions={
          organization.canOpenWorkspace && (
            <Link
              to="/app/$workspaceSlug/rounds"
              params={{ workspaceSlug: organization.slug }}
              className={linkStyles.button}
              data-variant="secondary"
            >
              {t("openWorkspace")}
            </Link>
          )
        }
      />
      <StatusMessage
        message={notice.message}
        eventId={notice.key}
        confirmation
        className={shellStyles.confirmation}
      />
      <div className={styles.details}>
        <dl className={styles.record}>
          <OrganizationName
            value={organization.name}
            editor={name}
            disabled={!hydrated || busy}
            actionRef={editNameAction}
          />
          <OrganizationAddress
            slug={organization.slug}
            onCopied={() => announce(t("addressCopied"))}
          />
          {organization.hasOwner && (
            <div className={styles.recordRow}>
              <dt id="owner-label">{t("owner")}</dt>
              <dd>
                <section ref={invitationSection} tabIndex={-1} aria-labelledby="owner-label">
                  {organization.owner?.name ? (
                    <PersonIdentity name={organization.owner.name} />
                  ) : (
                    <span className={styles.muted}>{t("ownerNameUnavailable")}</span>
                  )}
                </section>
              </dd>
            </div>
          )}
        </dl>
        {refreshProblem && (
          <Notice as="div" tone="danger" role="alert">
            <p>{t("refreshFailed")}</p>
            <Button
              ref={refreshAction}
              variant="secondary"
              isPending={refreshing}
              onPress={refresh}
            >
              {t("refresh")}
            </Button>
          </Notice>
        )}
        {!organization.hasOwner && (
          <InvitationSection
            work={invitationWork}
            disabled={!hydrated || busy || refreshProblem}
            sectionRef={invitationSection}
            actionRef={invitationAction}
          />
        )}
      </div>
      <InvitationConfirmations work={invitationWork} />
    </>
  );
};

const useOrganizationDetails = ({
  data,
  onCommitted,
}: Pick<Parameters<typeof useOrganization>[0], "data" | "onCommitted">) => {
  const editNameAction = useRef<HTMLButtonElement>(null);
  const restoreNameFocus = useRef(false);
  const invitationAction = useRef<HTMLButtonElement>(null);
  const refreshAction = useRef<HTMLButtonElement>(null);
  const invitationSection = useRef<HTMLElement>(null);
  const restoreActionFocus = useRef(false);
  const restoredAction = useRef<HTMLElement | null>(null);
  const work = useOrganization({
    data,
    onCommitted,
    onNameClosed: () => {
      restoreNameFocus.current = true;
    },
    onInvitationClosed: () => {
      restoreActionFocus.current = true;
    },
  });
  const { organization, name, busy, refreshFailed: refreshProblem } = work;
  const { editing: editingRecipient, replacement } = work.invitation;
  const editingName = name.editing;

  // A delayed refresh can remove the action after focus has already returned to it.
  useEffect(() => {
    const actionWasRemoved =
      restoredAction.current &&
      !restoredAction.current.isConnected &&
      document.activeElement === document.body;
    if (!busy && (restoreActionFocus.current || actionWasRemoved)) {
      const target = refreshProblem
        ? refreshAction.current
        : (invitationAction.current ?? invitationSection.current);
      target?.focus();
      restoredAction.current = target;
      restoreActionFocus.current = false;
    }
    if (!name.pending && restoreNameFocus.current) {
      editNameAction.current?.focus();
      restoreNameFocus.current = false;
    }
  }, [
    busy,
    refreshProblem,
    replacement,
    editingRecipient,
    editingName,
    name.pending,
    organization,
  ]);

  return { work, editNameAction, invitationAction, refreshAction, invitationSection };
};

const OrganizationName = ({
  value,
  editor,
  disabled,
  actionRef,
}: {
  value: string;
  editor: OrganizationController["name"];
  disabled: boolean;
  actionRef: Ref<HTMLButtonElement>;
}) => {
  const { t } = useTranslation("administration");
  const editLabel = t(editor.hasDraft ? "resumeName" : "editName");

  return (
    <div className={styles.recordRow}>
      <dt>{t("name")}</dt>
      <dd>
        {editor.editing ? (
          <NameEditor editor={editor} disabled={disabled} />
        ) : (
          <div className={styles.recordValue}>
            <span>{value}</span>
            <Tooltip content={editLabel}>
              <Button
                ref={actionRef}
                iconOnly
                data-draft={editor.hasDraft || undefined}
                variant="quiet"
                size="small"
                aria-label={editLabel}
                isDisabled={disabled}
                onPress={editor.open}
              >
                <Icon name="edit" />
              </Button>
            </Tooltip>
          </div>
        )}
      </dd>
    </div>
  );
};

const OrganizationAddress = ({ slug, onCopied }: { slug: string; onCopied: () => void }) => {
  const { t } = useTranslation("administration");
  const [copyError, setCopyError] = useState(false);
  const address = `/app/${slug}/rounds`;

  return (
    <div className={styles.recordRow}>
      <dt>{t("address")}</dt>
      <dd>
        <div className={styles.recordValue}>
          <span className={styles.address}>{address}</span>
          <Tooltip content={t("copyAddress")}>
            <Button
              variant="quiet"
              size="small"
              iconOnly
              aria-label={t("copyAddress")}
              onPress={async () => {
                try {
                  await navigator.clipboard.writeText(
                    new URL(address, window.location.origin).href,
                  );
                  setCopyError(false);
                  onCopied();
                } catch {
                  setCopyError(true);
                }
              }}
            >
              <Icon name="copy" />
            </Button>
          </Tooltip>
        </div>
        {copyError && (
          <Notice tone="danger" role="alert">
            {t("copyFailed")}
          </Notice>
        )}
      </dd>
    </div>
  );
};

const InvitationSection = ({
  work,
  disabled,
  sectionRef,
  actionRef,
}: {
  work: OrganizationController["invitation"];
  disabled: boolean;
  sectionRef: Ref<HTMLElement>;
  actionRef: Ref<HTMLButtonElement>;
}) => {
  const { t } = useTranslation("administration");

  return (
    <div className={styles.ownership}>
      <section
        ref={sectionRef}
        tabIndex={-1}
        className={styles.section}
        aria-labelledby="administrator-heading"
      >
        <SectionHeader
          id="administrator-heading"
          className={styles.ownerHeading}
          title={t("invitation")}
        />
        <InvitationSummary invitation={work.record} showStatus={false} />
        {!work.record?.acceptedAt && (
          <div className={styles.divider}>
            {work.editing ? (
              <OwnerEditor editor={work} disabled={disabled} actionRef={actionRef} />
            ) : (
              <InvitationActions work={work} disabled={disabled} actionRef={actionRef} />
            )}
          </div>
        )}
      </section>
    </div>
  );
};

const InvitationConfirmations = ({ work }: { work: OrganizationController["invitation"] }) => {
  const { t } = useTranslation("administration");
  const actionError = work.error ? t(`errors.${work.error.status}`) : null;

  return (
    <>
      <ConfirmationDialog
        title={t("revoke")}
        description={t("confirmRevoke", { email: work.record?.email ?? "" })}
        closeLabel={t("cancel")}
        cancelLabel={t("cancel")}
        confirmLabel={t("revokeConfirm")}
        pendingLabel={t("revoking")}
        intent="destructive"
        isOpen={work.confirmRevoke}
        onOpenChange={work.changeRevokeOpen}
        isPending={work.revoking}
        error={actionError}
        onConfirm={work.revoke}
      />
      <ConfirmationDialog
        title={t("replace")}
        description={t("confirmReplace", {
          previous: work.record?.email ?? "",
          next: work.replacement ?? "",
        })}
        closeLabel={t("cancel")}
        cancelLabel={t("cancel")}
        confirmLabel={t("replaceConfirm")}
        pendingLabel={t("sending")}
        isOpen={work.replacement !== null}
        onOpenChange={work.changeReplacementOpen}
        isPending={work.sending}
        error={actionError}
        onConfirm={work.replace}
      />
    </>
  );
};

const InvitationActions = ({
  work,
  disabled,
  actionRef,
}: {
  work: OrganizationController["invitation"];
  disabled: boolean;
  actionRef: Ref<HTMLButtonElement>;
}) => {
  const { t } = useTranslation("administration");
  const actionError = work.error ? t(`errors.${work.error.status}`) : null;

  return (
    <div className={styles.stack}>
      {actionError && (
        <Notice tone="danger" role="alert">
          {actionError}
        </Notice>
      )}
      <div className={styles.actions}>
        {work.active ? (
          <>
            <Button
              ref={actionRef}
              variant={invitationNeedsAttention(work.record, false) ? "primary" : "secondary"}
              isDisabled={disabled || !work.ready}
              isPending={work.sending}
              onPress={work.resend}
            >
              {t(work.sending ? "sending" : "resend")}
            </Button>
            <Button variant="quiet" isDisabled={disabled} onPress={work.open}>
              {t(work.hasDraft ? "resumeInvitation" : "replace")}
            </Button>
          </>
        ) : (
          <Button ref={actionRef} isDisabled={disabled} onPress={work.open}>
            {t(work.hasDraft ? "resumeInvitation" : "inviteOwner")}
          </Button>
        )}
      </div>
      {work.active && <p className={styles.muted}>{t("invitationHelp")}</p>}
      {work.active && (
        <div className={styles.secondaryActions}>
          <Button variant="quiet" size="small" isDisabled={disabled} onPress={work.requestRevoke}>
            {t("revoke")}
          </Button>
        </div>
      )}
    </div>
  );
};
