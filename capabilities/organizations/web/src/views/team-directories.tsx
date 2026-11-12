import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { permits } from "@merit/access";
import { SectionHeader } from "@merit/ui/section-header";
import { Tabs } from "@merit/ui/tabs";

import type { TeamSection } from "../contracts/team";
import { InvitationDirectory } from "./invitation-directory";
import { MemberDirectory } from "./member-directory";

type Props = ComponentProps<typeof MemberDirectory> &
  Pick<ComponentProps<typeof InvitationDirectory>, "onResend" | "onRevoke"> & {
    section: TeamSection;
    onSectionChange: (section: TeamSection) => void;
  };

export const TeamDirectories = ({
  team,
  isDisabled,
  onEdit,
  hasDraft,
  onRemove,
  onResend,
  onRevoke,
  section,
  onSectionChange,
}: Props) => {
  const { t } = useTranslation(["team", "common"]);
  const members = (
    <MemberDirectory
      team={team}
      isDisabled={isDisabled}
      onEdit={onEdit}
      onRemove={onRemove}
      hasDraft={hasDraft}
    />
  );
  if (!permits(team.subject, "manage_members", team.subject)) {
    return (
      <>
        <SectionHeader title={t("members")} count={team.members.length} />
        {members}
      </>
    );
  }

  const needsAttention = team.invitations.some(
    (invitation) =>
      invitation.delivery === "failed" || new Date(invitation.expiresAt) <= new Date(),
  );

  return (
    <Tabs<TeamSection>
      label={t("sections")}
      selectedKey={section}
      onSelectionChange={onSectionChange}
      scrollBackwardLabel={t("scrollTabsBackward", { ns: "common" })}
      scrollForwardLabel={t("scrollTabsForward", { ns: "common" })}
      items={[
        {
          id: "members",
          label: t("members"),
          count: team.members.length,
          content: members,
        },
        {
          id: "invitations",
          label: t("invitations"),
          count: team.invitations.length,
          countWarning: needsAttention ? t("invitationsNeedAttention") : undefined,
          content: (
            <InvitationDirectory
              team={team}
              isDisabled={isDisabled}
              onResend={onResend}
              onRevoke={onRevoke}
            />
          ),
        },
      ]}
    />
  );
};
