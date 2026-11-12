import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { TeamData, TeamSection, MutationResult, Member, Invitation } from "../contracts/team";
import { useTeamEditors, memberRequest } from "./editors";

export const useTeam = ({
  data,
  draftScope,
  onClose,
  onCommitted,
}: {
  data: TeamData;
  draftScope?: string;
  onClose: () => void;
  onCommitted: (nextSection?: TeamSection) => void;
}) => {
  const { t } = useTranslation("team");
  const { act, ...mutations } = useTeamMutations(data, onCommitted);

  const editors = useTeamEditors({
    team: data.team,
    draftScope,
    onClose,
    onInvite: (input) => act(() => data.invite(input), t("invitationSaved"), "invitations"),
    onChangeMember: (input) => act(() => data.changeMember(input), t("memberSaved")),
  });

  return {
    editors,
    ...mutations,
    remove: (member: Member) =>
      act(() => data.removeMember(memberRequest(data.team, member)), t("memberRemoved"), "members"),
    resend: (invitation: Invitation) =>
      act(
        () =>
          data.resend({ workspaceSlug: data.team.organization.slug, invitationId: invitation.id }),
        t("invitationSaved"),
      ),
    revoke: (invitation: Invitation) =>
      act(
        () =>
          data.revoke({ workspaceSlug: data.team.organization.slug, invitationId: invitation.id }),
        t("invitationRevoked"),
        "invitations",
      ),
  };
};

const useTeamMutations = (data: TeamData, onCommitted: (nextSection?: TeamSection) => void) => {
  const { t } = useTranslation("team");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<Exclude<MutationResult, { status: "ok" }>["status"] | null>(
    null,
  );
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [notice, setNotice] = useState({ message: null as string | null, key: 0 });
  const [stale, setStale] = useState(false);

  const refresh = async (afterSave = false) => {
    try {
      await (afterSave ? data.refreshAfterSave() : data.refresh());
      setRefreshFailed(false);
      setStale(false);
      setError(null);
    } catch {
      setRefreshFailed(true);
    }
  };

  const act = async (
    operation: () => Promise<MutationResult>,
    message: string,
    nextSection?: TeamSection,
  ) => {
    if (inFlight.current) {
      return t("errors.unavailable");
    }

    inFlight.current = true;
    setPending(true);
    setError(null);
    let problem: string | null = null;
    try {
      const result = await operation();
      if (result.status !== "ok") {
        setError(result.status);
        if (["conflict", "forbidden", "not_found"].includes(result.status)) {
          setStale(true);
        }
        problem = t(`errors.${result.status}`);
      } else {
        onCommitted(nextSection);
        setNotice((n) => ({ message, key: n.key + 1 }));
        await refresh(true);
      }
    } catch {
      setError("unavailable");
      problem = t("errors.unavailable");
    }

    inFlight.current = false;
    setPending(false);
    return problem;
  };

  return {
    act,
    error,
    refreshFailed,
    notice,
    stale,
    busy: pending || data.fetching,
    clearError: () => setError(null),
    refresh: () => refresh(),
  };
};
