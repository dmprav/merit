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
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";

import type { Team, Member, Invitation } from "../contracts/team";
import type { InviteDraft, Access } from "../controllers/editors";
import styles from "./team-view.module.css";

export const InvitationImpact = ({ invitations }: { invitations: Invitation[] }) => {
  const { t } = useTranslation("team");

  return invitations.length ? (
    <>
      <p>{t("revokedInvitations")}</p>
      <ul>
        {invitations.map((i) => (
          <li key={i.id}>{i.email}</li>
        ))}
      </ul>
    </>
  ) : (
    <p>{t("noIssuedInvitations")}</p>
  );
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
  const { t } = useTranslation("team");
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
              <FormSelect
                field={field}
                label={t("administration")}
                description={
                  field.state.value === "administrator" ? t("administrationHelp") : undefined
                }
                items={[
                  { id: "none", label: t("none") },
                  { id: "administrator", label: t("administrator") },
                ]}
              />
            )}
          </form.Field>
        )}
        <form.Field name="role">
          {(field) => (
            <FormSelect
              field={field}
              label={t("grantAccess")}
              description={field.state.value === "program_manager" ? t("roleHelp") : undefined}
              items={
                canAppoint
                  ? [
                      { id: "program_manager", label: t("program_manager") },
                      { id: "member", label: t("member") },
                    ]
                  : [{ id: "program_manager", label: t("program_manager") }]
              }
            />
          )}
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
  const { t } = useTranslation("team");
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
              <FormSelect
                field={field}
                label={t("administration")}
                description={
                  field.state.value === "administrator" ? t("administrationHelp") : undefined
                }
                items={[
                  { id: "none", label: t("none") },
                  { id: "administrator", label: t("administrator") },
                ]}
              />
            )}
          </form.Field>
        ) : (
          <p>
            {t("administration")}: {t(member.administration)}
          </p>
        )}
        <form.Field name="role">
          {(field) => (
            <FormSelect
              field={field}
              label={t("grantAccess")}
              description={field.state.value === "program_manager" ? t("roleHelp") : undefined}
              items={[
                { id: "program_manager", label: t("program_manager") },
                { id: "member", label: t("member") },
              ]}
            />
          )}
        </form.Field>
        {member.administration === "owner" && <p className={styles.muted}>{t("ownerHelp")}</p>}
        <form.Subscribe selector={(state) => state.values.administration}>
          {(administration) =>
            revokesIssuedInvitations(member.administration, administration) && (
              <Stack gap={3} className={styles.impact}>
                <p>{t("demotionHelp")}</p>
                <InvitationImpact
                  invitations={team.invitations.filter((i) => i.invitedBy === member.userId)}
                />
              </Stack>
            )
          }
        </form.Subscribe>
      </Stack>
    </Form>
  );
};
