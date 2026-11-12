import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Form, FormTextField, useForm } from "@merit/forms";
import { organizationName, invitationEmail } from "@merit/organizations/api";
import { Button } from "@merit/ui/button";
import { Icon } from "@merit/ui/icon";
import { Tooltip } from "@merit/ui/tooltip";

import type { OrganizationController } from "../controllers/organization";
import { useOrganizationSchema } from "./form-schema";
import styles from "./organization.module.css";

export const NameEditor = ({
  editor,
  disabled,
}: {
  editor: OrganizationController["name"];
  disabled: boolean;
}) => {
  const { t } = useTranslation("administration");
  const { form, submission } = useForm({
    defaultValues: { name: editor.value },
    schema: useOrganizationSchema(z.object({ name: organizationName })),
    submitErrorMessage: t("errors.unavailable"),
    onChange: ({ name }) => editor.change(name),
    onSubmit: async ({ name }) => {
      const failure = await editor.save(name);
      return failure ? t(`errors.${failure.status}`) : null;
    },
  });
  return (
    <Form
      label={t("editName")}
      className={styles.nameEditor}
      submission={{ ...submission, isSubmitting: disabled || submission.isSubmitting }}
      actions={
        <div className={styles.nameEditorActions}>
          <Tooltip content={t("save")}>
            <Button
              type="submit"
              variant="quiet"
              size="small"
              iconOnly
              aria-label={t(submission.isSubmitting ? "saving" : "save")}
              isPending={submission.isSubmitting}
            >
              <Icon name="check" />
            </Button>
          </Tooltip>
          <Tooltip content={t("cancel")}>
            <Button
              variant="quiet"
              size="small"
              iconOnly
              aria-label={t("cancel")}
              onPress={editor.cancel}
            >
              <Icon name="close" />
            </Button>
          </Tooltip>
        </div>
      }
    >
      <form.Field name="name">
        {(field) => (
          <FormTextField
            field={field}
            label={t("name")}
            className={styles.nameInput}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !disabled && !submission.isSubmitting) {
                event.preventDefault();
                editor.cancel();
              }
            }}
            isRequired
            autoFocus
          />
        )}
      </form.Field>
    </Form>
  );
};

export const OwnerEditor = ({
  editor,
  disabled,
  actionRef,
}: {
  editor: OrganizationController["invitation"];
  disabled: boolean;
  actionRef: React.Ref<HTMLButtonElement>;
}) => {
  const { t } = useTranslation("administration");
  const activeInvitation = editor.active;
  const { form, submission } = useForm({
    defaultValues: { email: editor.value },
    schema: useOrganizationSchema(z.object({ email: invitationEmail })),
    submitErrorMessage: t("errors.unavailable"),
    onChange: ({ email }) => editor.change(email),
    onSubmit: async ({ email }) => {
      const failure = await editor.submit(email);
      return failure ? t(`errors.${failure.status}`) : null;
    },
  });
  return (
    <Form
      label={t(activeInvitation ? "replace" : "invite")}
      submission={{ ...submission, isSubmitting: disabled || submission.isSubmitting }}
      actions={
        <div className={styles.actions}>
          <form.Subscribe selector={(state) => state.values.email}>
            {(email) => (
              <Button
                ref={actionRef}
                type="submit"
                isPending={submission.isSubmitting}
                isDisabled={activeInvitation && email.trim().toLowerCase() === editor.record?.email}
              >
                {t(submission.isSubmitting ? "sending" : activeInvitation ? "replace" : "invite")}
              </Button>
            )}
          </form.Subscribe>
          <Button variant="secondary" onPress={editor.close}>
            {t("closeEditor")}
          </Button>
          <Button variant="quiet" onPress={editor.discard}>
            {t("discard")}
          </Button>
        </div>
      }
    >
      <form.Field name="email">
        {(field) => (
          <FormTextField
            field={field}
            type="email"
            label={t("email")}
            description={t("emailDescription")}
            isRequired
            autoFocus
          />
        )}
      </form.Field>
    </Form>
  );
};
