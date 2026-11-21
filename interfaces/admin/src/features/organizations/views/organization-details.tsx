import { useHydrated } from "@tanstack/react-router";
import { useEffect, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Divider } from "@merit/ui/divider";
import { Icon } from "@merit/ui/icon";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { PersonIdentity } from "@merit/ui/person-identity";
import { SectionHeader } from "@merit/ui/section-header";
import { Text } from "@merit/ui/text";
import { showToast } from "@merit/ui/toast";
import { Tooltip } from "@merit/ui/tooltip";

import { RoutedLink } from "../../../shared/routed-link";
import type { OrganizationData } from "../contracts";
import { useOrganization, type OrganizationController } from "../controllers/organization";
import { NameEditor, OwnerEditor } from "./organization-editors";
import styles from "./organization.module.css";
import { InvitationBadge, InvitationSummary, invitationNeedsAttention } from "./owner-invitation";

export const OrganizationDetailsView = ({ data }: { data: OrganizationData }) => {
  const { t } = useTranslation("administration");
  const hydrated = useHydrated();
  const { work, editNameAction, invitationAction, refreshAction, invitationSection } =
    useOrganizationDetails({
      data,
      onCommitted: (event) => showToast({ tone: "success", message: t(event) }),
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
            <RoutedLink
              variant="secondary"
              to="/app/$workspaceSlug/rounds"
              params={{ workspaceSlug: organization.slug }}
            >
              {t("openWorkspace")}
            </RoutedLink>
          )
        }
      />
      <div className={styles.details}>
        <DescriptionList layout="rows" divided>
          <OrganizationName
            value={organization.name}
            editor={name}
            disabled={!hydrated || busy}
            actionRef={editNameAction}
          />
          <OrganizationAddress
            slug={organization.slug}
            onCopied={() => showToast({ tone: "success", message: t("addressCopied") })}
          />
          {organization.hasOwner && (
            <DescriptionListItem label={t("owner")} labelId="owner-label">
              <section ref={invitationSection} tabIndex={-1} aria-labelledby="owner-label">
                {organization.owner?.name ? (
                  <PersonIdentity name={organization.owner.name} />
                ) : (
                  <Text variant="missing">{t("ownerNameUnavailable")}</Text>
                )}
              </section>
            </DescriptionListItem>
          )}
        </DescriptionList>
        {refreshProblem && (
          <Notice
            tone="danger"
            role="alert"
            actions={
              <Button
                ref={refreshAction}
                variant="secondary"
                isPending={refreshing}
                onPress={refresh}
              >
                {t("refresh")}
              </Button>
            }
          >
            {t("refreshFailed")}
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
    <DescriptionListItem label={t("name")}>
      {editor.editing ? (
        <div className={styles.recordEditor}>
          <NameEditor editor={editor} disabled={disabled} />
        </div>
      ) : (
        <div className={styles.recordValue}>
          <span>{value}</span>
          <Tooltip content={editLabel}>
            <Button
              ref={actionRef}
              iconOnly
              data-draft={editor.hasDraft || undefined}
              variant="quiet"
              aria-label={editLabel}
              isDisabled={disabled}
              onPress={editor.open}
            >
              <Icon name="edit" />
            </Button>
          </Tooltip>
        </div>
      )}
    </DescriptionListItem>
  );
};

const OrganizationAddress = ({ slug, onCopied }: { slug: string; onCopied: () => void }) => {
  const { t } = useTranslation("administration");
  const address = `/app/${slug}/rounds`;

  return (
    <DescriptionListItem label={t("address")}>
      <div className={styles.recordValue}>
        <span className={styles.address}>{address}</span>
        <Tooltip content={t("copyAddress")}>
          <Button
            variant="quiet"
            iconOnly
            aria-label={t("copyAddress")}
            onPress={async () => {
              try {
                await navigator.clipboard.writeText(new URL(address, window.location.origin).href);
                onCopied();
              } catch {
                showToast({ tone: "danger", message: t("copyFailed") });
              }
            }}
          >
            <Icon name="copy" />
          </Button>
        </Tooltip>
      </div>
    </DescriptionListItem>
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
      <section ref={sectionRef} tabIndex={-1} aria-labelledby="administrator-heading">
        <SectionHeader id="administrator-heading" title={t("invitation")} />
        <div className={styles.section}>
          <InvitationSummary invitation={work.record} showStatus={false} />
          {!work.record?.acceptedAt && (
            <div className={styles.ownerActions}>
              <Stack gap={6}>
                <Divider />
                {work.editing ? (
                  <OwnerEditor editor={work} disabled={disabled} actionRef={actionRef} />
                ) : (
                  <InvitationActions work={work} disabled={disabled} actionRef={actionRef} />
                )}
              </Stack>
            </div>
          )}
        </div>
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
              size="medium"
              ref={actionRef}
              variant={invitationNeedsAttention(work.record, false) ? "primary" : "secondary"}
              isDisabled={disabled || !work.ready}
              isPending={work.sending}
              onPress={work.resend}
            >
              {t(work.sending ? "sending" : "resend")}
            </Button>
            <Button size="medium" variant="quiet" isDisabled={disabled} onPress={work.open}>
              {t(work.hasDraft ? "resumeInvitation" : "replace")}
            </Button>
          </>
        ) : (
          <Button size="medium" ref={actionRef} isDisabled={disabled} onPress={work.open}>
            {t(work.hasDraft ? "resumeInvitation" : "inviteOwner")}
          </Button>
        )}
      </div>
      {work.active && (
        <Text as="p" variant="caption">
          {t("invitationHelp")}
        </Text>
      )}
      {work.active && (
        <Stack gap={4}>
          <Divider />
          <div>
            <Button variant="quiet" isDisabled={disabled} onPress={work.requestRevoke}>
              {t("revoke")}
            </Button>
          </div>
        </Stack>
      )}
    </div>
  );
};
