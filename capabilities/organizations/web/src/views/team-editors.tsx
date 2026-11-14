import { useTranslation } from "react-i18next";
import { z } from "zod";

import { memberActions } from "@merit/access";
import {
  Form,
  FormActions,
  FormSelect,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { invitationEmail, teamAccess } from "@merit/organizations/api";
import { revokesIssuedInvitations } from "@merit/organizations/domain";
import { Icon } from "@merit/ui/icon";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { TextField } from "@merit/ui/text-field";

import type { Team, Member, Invitation } from "../contracts/team";
import type { InviteDraft, Access } from "../controllers/editors";
import styles from "./team-view.module.css";

const InvitationImpact = ({ invitations }: { invitations: Invitation[] }) => {
  const { t } = useTranslation("team");

  if (!invitations.length) {
    return null;
  }

  const summary = t("savingRevokesInvitations", {
    count: invitations.length,
  });

  return (
    <div className={styles.invitationWarning}>
      <Icon name="warning" />
      <p>
        <span>{summary}</span> {t("revocationRecovery")}
      </p>
    </div>
  );
};

const useAccessChoices = () => {
  const { t } = useTranslation("team");
  return {
    t,
    administrationItems: [
      { id: "none", label: t("none"), description: t("memberResponsibilityHelp") },
      { id: "administrator", label: t("administrator"), description: t("administrationHelp") },
    ] as const,
    roleItems: [
      { id: "program_manager", label: t("program_manager"), description: t("roleHelp") },
      { id: "member", label: t("member"), description: t("noGrantAccessHelp") },
    ] as const,
  };
};

export const InviteForm = ({
  draft,
  canAppoint,
  onChange,
  onSave,
  onCancel,
  onDiscard,
}: {
  draft: InviteDraft;
  canAppoint: boolean;
  onChange: (draft: InviteDraft) => void;
  onSave: (values: InviteDraft) => Promise<string | null>;
  onCancel: () => void;
  onDiscard: () => void;
}) => {
  const { t, administrationItems, roleItems } = useAccessChoices();
  const { form, submission } = useForm({
    defaultValues: draft,
    schema: useTranslatedSchema(
      teamAccess
        .extend({ email: invitationEmail, requestId: z.uuid() })
        .refine((values) => values.administration !== "none" || values.role !== "member", {
          message: t("chooseResponsibility"),
        }),
    ),
    onChange,
    onSubmit: onSave,
    submitErrorMessage: t("errors.unavailable"),
  });

  return (
    <Form
      label={t("invite")}
      submission={submission}
      actions={
        <FormActions
          submission={submission}
          onCancel={onCancel}
          cancelLabel={t("closeEditor")}
          discard={{ label: t("discard"), onPress: onDiscard }}
          submitLabel={t("invite")}
          submittingLabel={t("sending")}
        />
      }
    >
      <Stack gap={5}>
        <form.Field name="email">
          {(field) => (
            <FormTextField field={field} label={t("email")} type="email" isRequired autoFocus />
          )}
        </form.Field>
        {canAppoint && (
          <form.Field name="administration">
            {(field) => (
              <FormSelect field={field} label={t("administration")} items={administrationItems} />
            )}
          </form.Field>
        )}
        <form.Field name="role">
          {(field) =>
            canAppoint ? (
              <FormSelect field={field} label={t("grantAccess")} items={roleItems} />
            ) : (
              <TextField
                label={t("grantAccess")}
                value={t(field.state.value)}
                description={
                  field.state.value === "program_manager" ? t("roleHelp") : t("noGrantAccessHelp")
                }
                isReadOnly
              />
            )
          }
        </form.Field>
      </Stack>
    </Form>
  );
};

export const EditForm = ({
  member,
  team,
  onSave,
  onCancel,
  onDiscard,
  draft,
  onChange,
  conflict,
}: {
  member: Member;
  team: Team;
  onSave: (values: Access) => Promise<string | null>;
  onCancel: () => void;
  onDiscard: () => void;
  draft?: Access;
  onChange: (value: Access) => void;
  conflict: boolean;
}) => {
  const { t, administrationItems, roleItems } = useAccessChoices();
  const allowed = memberActions(team.subject, member);

  const { form, submission } = useForm<Access>({
    defaultValues: draft ?? {
      administration: member.administration === "none" ? "none" : "administrator",
      role: member.role === "program_manager" ? "program_manager" : "member",
    },
    schema: useTranslatedSchema(teamAccess),
    onChange,
    onSubmit: onSave,
    submitErrorMessage: t("errors.unavailable"),
  });

  return (
    <Form
      label={t("edit")}
      submission={submission}
      actions={
        <FormActions
          submission={submission}
          onCancel={onCancel}
          cancelLabel={t("closeEditor")}
          discard={{ label: t("discard"), onPress: onDiscard }}
          submitLabel={t("save")}
          submittingLabel={t("saving")}
          isSubmitDisabled={conflict}
        />
      }
    >
      {conflict && <Notice tone="warning">{t("draftConflict")}</Notice>}
      <Stack gap={5}>
        {allowed.canChangeAdministration ? (
          <form.Field name="administration">
            {(field) => (
              <FormSelect field={field} label={t("administration")} items={administrationItems} />
            )}
          </form.Field>
        ) : (
          <TextField
            label={t("administration")}
            value={t(member.administration)}
            description={member.administration === "owner" ? t("ownerHelp") : undefined}
            isReadOnly
          />
        )}
        <form.Field name="role">
          {(field) => <FormSelect field={field} label={t("grantAccess")} items={roleItems} />}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.administration}>
          {(administration) =>
            revokesIssuedInvitations(member.administration, administration) &&
            team.invitations.some((i) => i.invitedBy === member.userId) ? (
              <InvitationImpact
                invitations={team.invitations.filter((i) => i.invitedBy === member.userId)}
              />
            ) : null
          }
        </form.Subscribe>
      </Stack>
    </Form>
  );
};
