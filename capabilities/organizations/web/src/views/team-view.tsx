import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { permits } from "@merit/access";
import { FormDialog } from "@merit/forms";
import { useLocaleSettings } from "@merit/i18n";
import { RemotePagedContent } from "@merit/query/pages";
import { ActionProvenance } from "@merit/ui/action-provenance";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { PagedContent } from "@merit/ui/paged-content";
import { StateMessage } from "@merit/ui/state-message";
import { StatusMessage } from "@merit/ui/status-message";

import type { TeamData, TeamSection, Member, Invitation } from "../contracts/team";
import { useTeam } from "../controllers/team";
import { TeamDirectories } from "./team-directories";
import { InviteForm, EditForm, InvitationImpact } from "./team-editors";
import styles from "./team-view.module.css";

type TeamDialog =
  | { kind: "invite" }
  | { kind: "edit"; member: Member }
  | { kind: "remove"; member: Member }
  | { kind: "revoke"; invitation: Invitation }
  | null;

type TeamWorkflow = ReturnType<typeof useTeam>;

type TeamViewProps = { data: TeamData; draftScope?: string };

export const TeamView = ({ data, draftScope }: TeamViewProps) => {
  const { t } = useTranslation(["team", "common"]);
  const team = data.team;

  const [dialog, setDialog] = useState<TeamDialog>(null);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const directory = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<TeamSection>("members");
  const trigger = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const workflow = useTeam({
    data,
    draftScope,
    onClose: () => close(),
    onCommitted: (nextSection) => {
      if (nextSection) {
        setSection(nextSection);
        trigger.current = null;
      }
      close();
    },
  });
  const { editors, busy, refreshFailed, stale, refresh } = workflow;

  useTeamFocus({ busy, dialog, restoreFocus, trigger, recoveryButton, directory });

  const canManage = permits(team.subject, "manage_members", team.subject);
  const actionsDisabled = busy || refreshFailed || stale;

  const close = () => {
    restoreFocus.current = true;
    if (dialog?.kind === "invite") {
      editors.closeInvitation();
    }
    setDialog(null);
    workflow.clearError();
  };

  const open = (
    next: NonNullable<typeof dialog>,
    source = document.activeElement as HTMLElement | null,
  ) => {
    trigger.current = source;
    workflow.clearError();
    setDialog(next);
  };

  return (
    <DraftRecovery editors={editors}>
      <PageHeader
        title={t("title")}
        actions={
          canManage && (
            <Button
              isDisabled={actionsDisabled}
              onPress={() => {
                editors.openInvitation();
                open({ kind: "invite" });
              }}
            >
              {t(editors.invitationChanged ? "resumeInvite" : "invite")}
            </Button>
          )
        }
      />
      <Stack gap={5}>
        <TeamFeedback
          workflow={workflow}
          dialogOpen={dialog !== null}
          recoveryRef={recoveryButton}
          onRefresh={async () => {
            trigger.current = recoveryButton.current;
            restoreFocus.current = true;
            await refresh();
          }}
        />
        <div ref={directory} tabIndex={-1}>
          <TeamDirectories
            team={team}
            hasDraft={editors.hasMemberDraft}
            section={section}
            onSectionChange={setSection}
            isDisabled={actionsDisabled}
            onEdit={(member, source) => open({ kind: "edit", member }, source)}
            onRemove={(member, source) => open({ kind: "remove", member }, source)}
            onResend={(invitation, source) => {
              trigger.current = source;
              restoreFocus.current = true;
              return workflow.resend(invitation);
            }}
            onRevoke={(invitation, source) => open({ kind: "revoke", invitation }, source)}
          />
        </div>
        {canManage && data.historySource && <TeamHistory source={data.historySource} />}
        <TeamEditorDialog dialog={dialog} editors={editors} busy={busy} onClose={close} />
        <TeamConfirmationDialog
          dialog={dialog}
          organizationName={team.organization.name}
          invitations={team.invitations}
          workflow={workflow}
          onClose={close}
        />
      </Stack>
    </DraftRecovery>
  );
};

const TeamFeedback = ({
  workflow: { busy, error, refreshFailed, notice, stale },
  dialogOpen,
  recoveryRef,
  onRefresh,
}: {
  workflow: Pick<TeamWorkflow, "busy" | "error" | "refreshFailed" | "notice" | "stale">;
  dialogOpen: boolean;
  recoveryRef: Ref<HTMLButtonElement>;
  onRefresh: () => Promise<void>;
}) => {
  const { t } = useTranslation("team");

  return (
    <>
      <StatusMessage
        message={notice.message}
        eventId={notice.key}
        confirmation
        className={shellStyles.confirmation}
      />
      {(refreshFailed || stale) && (
        <Notice as="div" tone="danger" role="alert" className={styles.recovery}>
          <p>{t(refreshFailed ? "refreshFailed" : "teamChanged")}</p>
          <Button
            ref={recoveryRef}
            variant="secondary"
            size="small"
            isDisabled={busy}
            onPress={onRefresh}
          >
            {t("refresh")}
          </Button>
        </Notice>
      )}
      {error && !dialogOpen && !stale && (
        <Notice tone="danger" role="alert">
          {t(`errors.${error}`)}
        </Notice>
      )}
    </>
  );
};

const TeamHistory = ({ source }: { source: NonNullable<TeamData["historySource"]> }) => {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation(["team", "common"]);
  const { formatLocale } = useLocaleSettings();

  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{t("history")}</summary>
      <RemotePagedContent source={source} entries={[]} active={open}>
        {(page) => (
          <PagedContent {...page}>
            {(entries) => (
              <ol>
                {entries.map((entry) => {
                  const details =
                    entry.details &&
                    typeof entry.details === "object" &&
                    !Array.isArray(entry.details)
                      ? entry.details
                      : {};
                  const target = details.targetName ?? details.email;

                  return (
                    <li key={entry.eventId}>
                      <p>
                        <strong>{t(`historyActions.${historyActionLabel(entry.action)}`)}</strong>
                        {typeof target === "string" && <>: {target}</>}
                      </p>
                      <Inline align="baseline" gap={3}>
                        <span>
                          {t("common:recordedBy", { name: entry.actor ?? t("unknownName") })}
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
                  );
                })}
              </ol>
            )}
          </PagedContent>
        )}
      </RemotePagedContent>
    </details>
  );
};

const TeamEditorDialog = ({
  dialog,
  editors,
  busy,
  onClose,
}: {
  dialog: TeamDialog;
  editors: TeamWorkflow["editors"];
  busy: boolean;
  onClose: () => void;
}) => {
  const { t } = useTranslation("team");
  const title =
    dialog?.kind === "edit"
      ? t("editPerson", {
          person: dialog.member.name || dialog.member.email || t("unknownName"),
        })
      : t("invite");

  return (
    <FormDialog
      title={title}
      closeLabel={t("close")}
      trigger={null}
      isOpen={dialog?.kind === "invite" || dialog?.kind === "edit"}
      onOpenChange={(isOpen) => {
        if (!isOpen && !busy) {
          onClose();
        }
      }}
      isDismissDisabled={busy}
    >
      {dialog?.kind === "invite" && editors.invitation && <InviteForm {...editors.invitation} />}
      {dialog?.kind === "edit" && <EditForm {...editors.memberEditor(dialog.member)} />}
    </FormDialog>
  );
};

const TeamConfirmationDialog = ({
  dialog,
  organizationName,
  invitations,
  workflow,
  onClose,
}: {
  dialog: TeamDialog;
  organizationName: string;
  invitations: Invitation[];
  workflow: Pick<TeamWorkflow, "busy" | "error" | "remove" | "revoke">;
  onClose: () => void;
}) => {
  const { t } = useTranslation("team");
  if (dialog?.kind !== "remove" && dialog?.kind !== "revoke") {
    return null;
  }

  const removing = dialog.kind === "remove";
  const title = removing
    ? t("removePerson", {
        person: dialog.member.name || dialog.member.email || t("unknownName"),
        organization: organizationName,
      })
    : t("revokeTitle");

  return (
    <ConfirmationDialog
      title={title}
      description={
        removing ? t("removeAccess") : t("revokeHelp", { email: dialog.invitation.email })
      }
      closeLabel={t("close")}
      cancelLabel={t("cancel")}
      confirmLabel={t(removing ? "remove" : "revoke")}
      pendingLabel={t(removing ? "removing" : "revoking")}
      intent="destructive"
      isOpen
      isPending={workflow.busy}
      error={workflow.error ? t(`errors.${workflow.error}`) : null}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
      onConfirm={() =>
        removing ? workflow.remove(dialog.member) : workflow.revoke(dialog.invitation)
      }
    >
      {removing && (
        <>
          <Stack gap={3} className={styles.impact}>
            <h3 className={styles.impactTitle}>{t("handover")}</h3>
            <p>{t("handoverDescription")}</p>
            <InvitationImpact
              invitations={invitations.filter((i) => i.invitedBy === dialog.member.userId)}
            />
          </Stack>
          <p className={styles.muted}>{t("returnHelp")}</p>
        </>
      )}
    </ConfirmationDialog>
  );
};

const DraftRecovery = ({
  editors,
  children,
}: {
  editors: TeamWorkflow["editors"];
  children: ReactNode;
}) => {
  const { t } = useTranslation("team");
  if (!editors.ready) {
    return <StateMessage title={t("draftsRestoring")} role="status" />;
  }
  return (
    <>
      {editors.storageError && (
        <Notice tone="warning">
          {t(editors.storageConflict ? "draftRecoveryConflict" : "draftStorageUnavailable")}
        </Notice>
      )}
      {children}
    </>
  );
};

const useTeamFocus = ({
  busy,
  dialog,
  restoreFocus,
  trigger,
  recoveryButton,
  directory,
}: {
  busy: boolean;
  dialog: TeamDialog;
  restoreFocus: { current: boolean };
  trigger: { current: HTMLElement | null };
  recoveryButton: { current: HTMLButtonElement | null };
  directory: { current: HTMLDivElement | null };
}) => {
  // Directory and recovery updates can remove the return target without changing busy or dialog state.
  useEffect(() => {
    if (busy || dialog || !restoreFocus.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      restoreFocus.current = false;
      // A quick retry may already have reopened the menu; do not move focus out of it.
      if (
        trigger.current?.isConnected &&
        trigger.current.getAttribute("aria-expanded") === "true"
      ) {
        return;
      }

      (trigger.current?.isConnected && !trigger.current.matches(":disabled")
        ? trigger.current
        : (recoveryButton.current ??
          directory.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
          directory.current)
      )?.focus();
    });

    return () => cancelAnimationFrame(frame);
  });
};

const historyActions = {
  "organization.created": "created",
  "organization.renamed": "renamed",
  "team_invitation.issued": "invited",
  "team_invitation.replaced": "replaced",
  "team_invitation.revoked": "revoked",
  "team_invitation.accepted": "accepted",
  "membership.access_changed": "member_changed",
  "membership.removed": "member_removed",
} as const;

const historyActionLabel = (action: string) =>
  historyActions[action as keyof typeof historyActions] ?? "changed";
