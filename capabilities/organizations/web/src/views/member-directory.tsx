import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { memberActions, permits } from "@merit/access";
import type { Team } from "@merit/organizations/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { ActionMenu } from "@merit/ui/action-menu";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { PersonIdentity } from "@merit/ui/person-identity";
import { Tooltip } from "@merit/ui/tooltip";

type Member = Team["members"][number];

type DirectoryProps = {
  team: Team;
  isDisabled: boolean;
  hasDraft?: (member: Member) => boolean;
  onEdit: (member: Member, trigger: HTMLButtonElement | null) => void;
  onRemove: (member: Member, trigger: HTMLButtonElement | null) => void;
};

const MemberActions = ({
  member,
  team,
  isDisabled,
  onEdit,
  onRemove,
  hasDraft,
}: DirectoryProps & { member: Member }) => {
  const { t } = useTranslation("team");
  const trigger = useRef<HTMLButtonElement>(null);
  const allowed = memberActions(team.subject, member);
  if (!allowed.canEdit) {
    return null;
  }

  const resumeLabel = t("resumeAccess", {
    person: member.name || member.email || t("unknownName"),
  });

  return (
    <>
      {hasDraft?.(member) && (
        <Tooltip content={resumeLabel}>
          <Button
            variant="quiet"
            size="small"
            iconOnly
            data-draft
            aria-label={resumeLabel}
            isDisabled={isDisabled}
            onPress={(event) => onEdit(member, event.target as HTMLButtonElement)}
          >
            <Icon name="edit" />
          </Button>
        </Tooltip>
      )}
      <ActionMenu
        label={t("memberActions", { person: member.name || member.email || t("unknownName") })}
        trigger={
          <Button
            ref={trigger}
            variant="quiet"
            size="small"
            iconOnly
            isDisabled={isDisabled}
            aria-label={t("memberActions", {
              person: member.name || member.email || t("unknownName"),
            })}
          >
            <Icon name="more" />
          </Button>
        }
        items={[
          { id: "edit", label: t("edit") },
          ...(allowed.canRemove ? [{ id: "remove", label: t("remove") }] : []),
        ]}
        onAction={(action) =>
          action === "edit" ? onEdit(member, trigger.current) : onRemove(member, trigger.current)
        }
      />
    </>
  );
};

type MemberRow = DirectoryProps & { member: Member };

export const MemberDirectory = (props: DirectoryProps) => {
  const { team } = props;
  const { t } = useTranslation("team");
  const canManage = permits(team.subject, "manage_members", team.subject);

  const columns: TableColumn<MemberRow>[] = [
    {
      id: "person",
      header: t("person"),
      layout: { width: "36%" },
      cell: ({ member }) => (
        <PersonIdentity
          name={member.name || member.email || t("unknownName")}
          description={
            <>
              {member.email || t("unknownEmail")}
              {member.userId === team.subject.userId && <> ({t("you")})</>}
              {!member.active && (
                <>
                  <br />
                  {t("disabled")}
                </>
              )}
            </>
          }
        />
      ),
    },
    {
      id: "administration",
      header: t("administration"),
      layout: { width: "24%" },
      cell: ({ member }) => <>{t(member.administration)}</>,
    },
    {
      id: "role",
      header: t("grantAccess"),
      layout: { width: "22%" },
      cell: ({ member }) => <>{t(member.role)}</>,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: t("actions"),
            layout: {
              width: "5rem",
              align: "end" as const,
              rowActions: true,
            },
            cell: (record) => <MemberActions {...record} />,
          } satisfies TableColumn<MemberRow>,
        ]
      : []),
  ];

  return (
    <DataTable
      data={team.members.map((member) => ({ ...props, member }))}
      columns={columns}
      getRowId={(row) => row.member.userId}
      label={t("members")}
      emptyMessage={t("noMembers")}
    />
  );
};
