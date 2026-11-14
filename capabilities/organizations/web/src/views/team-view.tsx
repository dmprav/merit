import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";

import { permits } from "@merit/access";
import { FormDialog } from "@merit/forms";
import shellStyles from "@merit/ui/application-shell.module.css";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading } from "@merit/ui/editor-loading";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { PageHeader } from "@merit/ui/page-header";
import { StatusMessage } from "@merit/ui/status-message";

import type { TeamData, TeamSection, Member, Invitation } from "../contracts/team";
import { useTeam } from "../controllers/team";
import { TeamDirectories } from "./team-directories";
import { InviteForm, EditForm } from "./team-editors";

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
        <Notice
          tone="warning"
          role="alert"
          title={t(
            refreshFailed && !stale && notice.message ? "refreshFailedTitle" : "teamChangedTitle",
          )}
          actions={
            <Button
              ref={recoveryRef}
              variant="secondary"
              size="small"
              isDisabled={busy}
              onPress={onRefresh}
            >
              {t("refresh")}
            </Button>
          }
        >
          {t(refreshFailed ? "refreshFailed" : "teamChanged")}
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
      {(dialog?.kind === "invite" && (!editors.invitationReady || !editors.invitation)) ||
      (dialog?.kind === "edit" && !editors.memberReady) ? (
        <DialogContent label={title}>
          <EditorLoading />
        </DialogContent>
      ) : (
        <>
          {dialog?.kind === "invite" && editors.invitation && (
            <InviteForm {...editors.invitation} />
          )}
          {dialog?.kind === "edit" && <EditForm {...editors.memberEditor(dialog.member)} />}
        </>
      )}
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
  const affectedCount = removing
    ? invitations.filter((invitation) => invitation.invitedBy === dialog.member.userId).length
    : 0;
  const title = removing
    ? t("removePerson", {
        person: dialog.member.name || dialog.member.email || t("unknownName"),
        organization: organizationName,
      })
    : t("revokeTitle");

  const removalDescription = affectedCount ? "removeAccessWithInvitations" : "removeAccess";
  const failureMessage = removing ? "removalFailed" : "revocationFailed";
  const error =
    workflow.error &&
    t(workflow.error === "unavailable" ? failureMessage : `errors.${workflow.error}`);

  return (
    <ConfirmationDialog
      title={title}
      description={
        removing
          ? t(removalDescription, {
              count: affectedCount,
            })
          : t("revokeHelp", { email: dialog.invitation.email })
      }
      closeLabel={t("close")}
      cancelLabel={t("cancel")}
      confirmLabel={t(removing ? "remove" : "revoke")}
      pendingLabel={t(removing ? "removing" : "revoking")}
      intent="destructive"
      isOpen
      isPending={workflow.busy}
      error={error}
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
          <p>{t("retainedWorkDescription")}</p>
          <p>{t("handoverDescription")}</p>
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
