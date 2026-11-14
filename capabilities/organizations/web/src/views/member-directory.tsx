import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";

import { memberActions, permits } from "@merit/access";
import type { Team } from "@merit/organizations/api";
import { DataTable, type TableColumn } from "@merit/tables";
import { ActionMenu } from "@merit/ui/action-menu";
import { Badge } from "@merit/ui/badge";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { PersonIdentity } from "@merit/ui/person-identity";

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
  const draftDescription = useId();
  const draft = hasDraft?.(member);
  const allowed = memberActions(team.subject, member);
  if (!allowed.canEdit) {
    return null;
  }

  const resumeLabel = t("resumeAccess");

  return (
    <>
      {draft && (
        <span id={draftDescription} hidden>
          {resumeLabel}
        </span>
      )}
      <ActionMenu
        label={t("memberActions", { person: member.name || member.email || t("unknownName") })}
        trigger={
          <Button
            ref={trigger}
            variant="quiet"
            size="small"
            iconOnly
            data-draft={draft || undefined}
            aria-describedby={draft ? draftDescription : undefined}
            isDisabled={isDisabled}
            aria-label={t("memberActions", {
              person: member.name || member.email || t("unknownName"),
            })}
          >
            <Icon name="more" />
          </Button>
        }
        items={[
          { id: "edit", label: draft ? resumeLabel : t("edit") },
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
          annotation={member.userId === team.subject.userId ? t("you") : undefined}
          status={!member.active ? <Badge tone="danger">{t("disabled")}</Badge> : undefined}
          description={member.email || t("unknownEmail")}
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
              width: "3rem",
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
