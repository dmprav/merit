import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { memberActions } from "@merit/access";
import {
  ConflictBanner,
  Form,
  FormActions,
  FormSelect,
  FormTextField,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { invitationEmail, teamAccess } from "@merit/organizations/api";
import { revokesIssuedInvitations, revokesReviewAccess } from "@merit/organizations/domain";
import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";
import { Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";
import { TextField } from "@merit/ui/text-field";

import type { Team, Member, Invitation } from "../contracts/team";
import type { InviteDraft, Access } from "../controllers/editors";

const InvitationImpact = ({ invitations }: { invitations: Invitation[] }) => {
  const { t } = useTranslation("team");

  if (!invitations.length) {
    return null;
  }

  const summary = t("savingRevokesInvitations", {
    count: invitations.length,
  });

  return (
    <Notice tone="warning" appearance="inline">
      <span>{summary}</span> {t("revocationRecovery")}
    </Notice>
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
      { id: "reviewer", label: t("reviewer"), description: t("reviewerHelp") },
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
          {(field) => <FormSelect field={field} label={t("grantAccess")} items={roleItems} />}
        </form.Field>
      </Stack>
    </Form>
  );
};

type EditFormProps = {
  member: Member;
  team: Team;
  onSave: (values: Access) => Promise<string | null>;
  onCancel: () => void;
  onDiscard: () => void;
  draft?: Access;
  draftReset?: number;
  onChange: (value: Access) => void;
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
  conflict: boolean;
};

export const EditForm = ({ draftReset = 0, ...props }: EditFormProps) => (
  <EditFormFields key={draftReset} {...props} />
);

const EditAccessConflictBanner = ({
  member,
  onKeepDraft,
  onLoadLatest,
  isDisabled,
}: {
  member: EditFormProps["member"];
  onKeepDraft?: () => void;
  onLoadLatest?: () => void;
  isDisabled: boolean;
}) => {
  const { t } = useTranslation("team");
  return (
    <ConflictBanner
      title={t("draftConflictTitle")}
      message={t("draftConflict")}
      keepMine={onKeepDraft ? { label: t("keepDraft"), onPress: onKeepDraft } : undefined}
      useSaved={onLoadLatest ? { label: t("loadLatest"), onPress: onLoadLatest } : undefined}
      isDisabled={isDisabled}
      latest={{
        toggleLabel: t("viewLatest"),
        hideLabel: t("hideLatest"),
        heading: t("latestSavedAccess"),
        children: (
          <DescriptionList>
            <DescriptionListItem label={t("administration")}>
              {t(member.administration)}
            </DescriptionListItem>
            <DescriptionListItem label={t("grantAccess")}>{t(member.role)}</DescriptionListItem>
          </DescriptionList>
        ),
      }}
    />
  );
};

const defaultAccessValues = (member: Member, draft?: Access): Access =>
  draft ?? {
    administration: member.administration === "none" ? "none" : "administrator",
    role: member.role === "committee_reader" ? "member" : member.role,
  };

const AdministrationAccessField = ({
  canChangeAdministration,
  member,
  administrationItems,
  renderSelect,
}: {
  canChangeAdministration: boolean;
  member: Member;
  administrationItems: ReturnType<typeof useAccessChoices>["administrationItems"];
  renderSelect: (items: ReturnType<typeof useAccessChoices>["administrationItems"]) => ReactNode;
}) => {
  const { t } = useTranslation("team");
  if (canChangeAdministration) {
    return renderSelect(administrationItems);
  }
  return (
    <TextField
      label={t("administration")}
      value={t(member.administration)}
      description={member.administration === "owner" ? t("ownerHelp") : undefined}
      isReadOnly
    />
  );
};

const EditFormFields = ({
  member,
  team,
  onSave,
  onCancel,
  onDiscard,
  draft,
  onChange,
  onKeepDraft,
  onLoadLatest,
  conflict,
}: Omit<EditFormProps, "draftReset">) => {
  const { t, administrationItems, roleItems } = useAccessChoices();
  const allowed = memberActions(team.subject, member);

  const { form, submission } = useForm<Access>({
    defaultValues: defaultAccessValues(member, draft),
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
      <Stack gap={5}>
        {conflict && (
          <EditAccessConflictBanner
            member={member}
            onKeepDraft={onKeepDraft}
            onLoadLatest={onLoadLatest}
            isDisabled={submission.isSubmitting}
          />
        )}
        <AdministrationAccessField
          canChangeAdministration={allowed.canChangeAdministration}
          member={member}
          administrationItems={administrationItems}
          renderSelect={(items) => (
            <form.Field name="administration">
              {(field) => <FormSelect field={field} label={t("administration")} items={items} />}
            </form.Field>
          )}
        />
        <form.Field name="role">
          {(field) => <FormSelect field={field} label={t("grantAccess")} items={roleItems} />}
        </form.Field>
        <form.Subscribe selector={(state) => state.values.role}>
          {(role) =>
            revokesReviewAccess(member.role, role) ? (
              <Notice tone="warning" appearance="inline">
                {t("savingEndsReviewAssignments")}
              </Notice>
            ) : null
          }
        </form.Subscribe>
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
