import { useLayoutEffect, useState, type Dispatch, type SetStateAction } from "react";
import { z } from "zod";

import { permits } from "@merit/access";
import { useDrafts } from "@merit/drafts";
import { teamAccess } from "@merit/organizations/api";
import { revokesIssuedInvitations } from "@merit/organizations/domain";

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

type AccessDraft = z.infer<typeof accessDraftSchema>;

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

const memberBaseline = (team: Team, member: Member) => ({
  expectedMembershipId: member.membershipId,
  expectedVersion: member.version,
  expectedInvitationIds: team.invitations
    .filter((i) => i.invitedBy === member.userId)
    .map((i) => i.id),
});

export const memberRequest = (
  team: Team,
  member: Member,
  baseline = memberBaseline(team, member),
) => ({
  workspaceSlug: team.organization.slug,
  userId: member.userId,
  expectedMembershipId: baseline.expectedMembershipId,
  expectedMembershipVersion: baseline.expectedVersion,
  expectedInvitationIds: baseline.expectedInvitationIds,
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

const sameIdSet = (left: string[], right: string[]) => {
  const rightIds = new Set(right);
  const leftIds = new Set(left);
  return leftIds.size === rightIds.size && [...leftIds].every((id) => rightIds.has(id));
};

const hasMemberAccessConflict = (
  team: UseTeamEditorsOptions["team"],
  member: Member,
  saved: AccessDraft | undefined,
) => {
  if (!saved) {
    return false;
  }
  const baseline = memberBaseline(team, member);
  return (
    saved.expectedMembershipId !== member.membershipId ||
    saved.expectedVersion !== member.version ||
    (revokesIssuedInvitations(member.administration, saved.value.administration) &&
      !sameIdSet(saved.expectedInvitationIds, baseline.expectedInvitationIds))
  );
};

type AccessStore = ReturnType<typeof useDrafts<AccessDraft>>;

const memberConflictActions = ({
  team,
  member,
  draftScopeKey,
  saved,
  serverConflict,
  storeConflict,
  updateAccess,
  resolveConflict,
  setDraftReset,
  clear,
}: {
  team: Team;
  member: Member;
  draftScopeKey: string;
  saved: AccessDraft | undefined;
  serverConflict: boolean;
  storeConflict: boolean;
  updateAccess: AccessStore["update"];
  resolveConflict: AccessStore["resolveConflict"];
  setDraftReset: Dispatch<SetStateAction<number>>;
  clear: () => void;
}) => ({
  onKeepDraft: () => {
    if (!saved) {
      return;
    }
    if (serverConflict) {
      updateAccess((current) => ({
        ...current,
        [draftScopeKey]: { ...memberBaseline(team, member), value: saved.value },
      }));
    }
    if (storeConflict) {
      resolveConflict(draftScopeKey, "keep");
    }
  },
  onLoadLatest: () => {
    if (storeConflict) {
      resolveConflict(draftScopeKey, "use_stored");
    } else {
      clear();
    }
    setDraftReset((count) => count + 1);
  },
});

const buildMemberEditor = ({
  team,
  member,
  draftScopeKey,
  saved,
  conflicts,
  updateAccess,
  resolveConflict,
  draftReset,
  setDraftReset,
  onChangeMember,
  onClose,
}: {
  team: Team;
  member: Member;
  draftScopeKey: string;
  saved: AccessDraft | undefined;
  conflicts: ReadonlySet<string>;
  updateAccess: AccessStore["update"];
  resolveConflict: AccessStore["resolveConflict"];
  draftReset: number;
  setDraftReset: Dispatch<SetStateAction<number>>;
  onChangeMember: UseTeamEditorsOptions["onChangeMember"];
  onClose: () => void;
}) => {
  const serverConflict = hasMemberAccessConflict(team, member, saved);
  const storeConflict = conflicts.has(draftScopeKey);

  const clear = () => updateAccess((current) => ({ ...current, [draftScopeKey]: undefined }));

  return {
    member,
    team,
    draftReset,
    onCancel: onClose,
    onDiscard: () => {
      clear();
      onClose();
    },
    draft: saved?.value,
    conflict: serverConflict || storeConflict,
    ...memberConflictActions({
      team,
      member,
      draftScopeKey,
      saved,
      serverConflict,
      storeConflict,
      updateAccess,
      resolveConflict,
      setDraftReset,
      clear,
    }),
    onChange: (value: Access) =>
      updateAccess((current) => {
        const previous = current[draftScopeKey];
        const unchanged =
          (!previous || previous.expectedVersion === member.version) &&
          value.administration === member.administration &&
          value.role === member.role;
        return {
          ...current,
          [draftScopeKey]: unchanged
            ? undefined
            : { ...(previous ?? memberBaseline(team, member)), value },
        };
      }),
    onSave: async (values: Access) => {
      const problem = await onChangeMember({
        ...memberRequest(team, member, saved),
        ...values,
      });
      if (!problem) {
        clear();
      }
      return problem;
    },
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
    conflicts: accessConflicts,
    resolveConflict: resolveAccessConflict,
  } = useDrafts(draftScope, "team-access", { version: 1, schema: accessDraftSchema });
  const [draftReset, setDraftReset] = useState(0);
  const workspaceSlug = team.organization.slug;

  const accessKey = (member: Member) => `${workspaceSlug}/${member.userId}`;

  return {
    ready: accessReady,
    storageConflict: accessStatus === "conflict",
    storageError: accessStorageError,
    hasMemberDraft: (member: Member) => Boolean(accessDrafts[accessKey(member)]),
    memberEditor: (member: Member) => {
      const draftScopeKey = accessKey(member);
      return buildMemberEditor({
        team,
        member,
        draftScopeKey,
        saved: accessDrafts[draftScopeKey],
        conflicts: accessConflicts,
        updateAccess,
        resolveConflict: resolveAccessConflict,
        draftReset,
        setDraftReset,
        onChangeMember,
        onClose,
      });
    },
  };
};
