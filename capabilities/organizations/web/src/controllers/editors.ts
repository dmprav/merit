import { useLayoutEffect, useState } from "react";
import { z } from "zod";

import { permits } from "@merit/access";
import { useDrafts } from "@merit/drafts";
import { teamAccess } from "@merit/organizations/api";

import type { Team, Member, InviteInput, ChangeMemberInput } from "../contracts/team";

export type Access = z.infer<typeof teamAccess>;

const invitationDraftSchema = teamAccess.extend({ email: z.string(), requestId: z.string() });

export type InviteDraft = z.infer<typeof invitationDraftSchema>;

const accessDraftSchema = z.object({
  value: teamAccess,
  expectedMembershipId: z.string(),
  expectedVersion: z.number(),
  expectedInvitationIds: z.array(z.string()),
});

const newInvitation = (): InviteDraft => ({
  requestId: crypto.randomUUID(),
  email: "",
  administration: "none",
  role: "program_manager",
});

const hasInvitation = (draft: InviteDraft | null) =>
  Boolean(
    draft && (draft.email || draft.administration !== "none" || draft.role !== "program_manager"),
  );

export const memberRequest = (team: Team, member: Member) => ({
  workspaceSlug: team.organization.slug,
  userId: member.userId,
  expectedMembershipId: member.membershipId,
  expectedVersion: member.version,
  expectedInvitationIds: team.invitations
    .filter((i) => i.invitedBy === member.userId)
    .map((i) => i.id),
});

type UseTeamEditorsOptions = {
  team: Team;
  draftScope?: string;
  onInvite: (input: InviteInput) => Promise<string | null>;
  onChangeMember: (input: ChangeMemberInput) => Promise<string | null>;
  onClose: () => void;
};

export const useTeamEditors = ({
  team,
  draftScope,
  onInvite,
  onChangeMember,
  onClose,
}: UseTeamEditorsOptions) => {
  const {
    drafts: invitations,
    update: updateInvitations,
    storageUnavailable: invitationStorageError,
    ready: invitationReady,
    status: invitationStatus,
  } = useDrafts(draftScope, "team-invitations", { version: 1, schema: invitationDraftSchema });
  const access = useMemberEditors({ team, draftScope, onChangeMember, onClose });

  const workspaceSlug = team.organization.slug;
  const inviteDraft = invitations[workspaceSlug] ?? null;
  const [requestedInvitation, setRequestedInvitation] = useState<string | null>(null);
  const invitationScope = `${draftScope ?? ""}/${workspaceSlug}`;

  useLayoutEffect(() => {
    if (invitationReady && requestedInvitation === invitationScope && !inviteDraft) {
      updateInvitations((current) => ({
        ...current,
        [workspaceSlug]: newInvitation(),
      }));
    }
  }, [
    invitationReady,
    requestedInvitation,
    invitationScope,
    inviteDraft,
    updateInvitations,
    workspaceSlug,
  ]);

  const setInviteDraft = (value: InviteDraft | null) =>
    updateInvitations((current) => ({ ...current, [workspaceSlug]: value ?? undefined }));

  const canAppoint = permits(team.subject, "manage_administrators", team.subject);

  return {
    invitationReady,
    memberReady: access.ready,
    storageConflict: invitationStatus === "conflict" || access.storageConflict,
    storageError: invitationStorageError || access.storageError,
    invitationChanged: hasInvitation(inviteDraft),
    openInvitation: () => setRequestedInvitation(invitationScope),
    closeInvitation: () => {
      setRequestedInvitation(null);
      if (invitationReady && !hasInvitation(inviteDraft)) {
        setInviteDraft(null);
      }
    },
    hasMemberDraft: access.hasMemberDraft,
    invitation: inviteDraft
      ? {
          draft: inviteDraft,
          canAppoint,
          onChange: setInviteDraft,
          onCancel: onClose,
          onDiscard: () => {
            onClose();
            setInviteDraft(null);
          },
          onSave: async (values: InviteDraft) => {
            const problem = await onInvite({ ...values, workspaceSlug });
            if (!problem) {
              setInviteDraft(null);
            }
            return problem;
          },
        }
      : null,
    memberEditor: access.memberEditor,
  };
};

const useMemberEditors = ({
  team,
  draftScope,
  onChangeMember,
  onClose,
}: Pick<UseTeamEditorsOptions, "team" | "draftScope" | "onChangeMember" | "onClose">) => {
  const {
    drafts: accessDrafts,
    update: updateAccess,
    storageUnavailable: accessStorageError,
    ready: accessReady,
    status: accessStatus,
  } = useDrafts(draftScope, "team-access", { version: 1, schema: accessDraftSchema });

  const workspaceSlug = team.organization.slug;

  const accessKey = (member: Member) => `${workspaceSlug}/${member.userId}`;

  const clearAccess = (member: Member) =>
    updateAccess((current) => ({ ...current, [accessKey(member)]: undefined }));

  return {
    ready: accessReady,
    storageConflict: accessStatus === "conflict",
    storageError: accessStorageError,
    hasMemberDraft: (member: Member) => Boolean(accessDrafts[accessKey(member)]),
    memberEditor: (member: Member) => ({
      member,
      team,
      onCancel: onClose,
      onDiscard: () => {
        clearAccess(member);
        onClose();
      },
      draft: accessDrafts[accessKey(member)]?.value,
      conflict: Boolean(
        accessDrafts[accessKey(member)] &&
        (accessDrafts[accessKey(member)]!.expectedMembershipId !== member.membershipId ||
          accessDrafts[accessKey(member)]!.expectedVersion !== member.version ||
          JSON.stringify([...accessDrafts[accessKey(member)]!.expectedInvitationIds].sort()) !==
            JSON.stringify(memberRequest(team, member).expectedInvitationIds.sort())),
      ),
      onChange: (value: Access) =>
        updateAccess((current) => {
          const previous = current[accessKey(member)];
          const unchanged =
            (!previous || previous.expectedVersion === member.version) &&
            value.administration === member.administration &&
            value.role === member.role;

          return {
            ...current,
            [accessKey(member)]: unchanged
              ? undefined
              : { ...(previous ?? memberRequest(team, member)), value },
          };
        }),
      onSave: async (values: Access) => {
        const draft = accessDrafts[accessKey(member)];
        const problem = await onChangeMember({
          ...memberRequest(team, member),
          ...(draft
            ? {
                expectedMembershipId: draft.expectedMembershipId,
                expectedVersion: draft.expectedVersion,
                expectedInvitationIds: draft.expectedInvitationIds,
              }
            : {}),
          ...values,
        });
        if (!problem) {
          clearAccess(member);
        }
        return problem;
      },
    }),
  };
};
