import { useHydrated } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Form, FormActions, FormTextField, useForm } from "@merit/forms";
import { createOrganizationInput, suggestSlug } from "@merit/organizations/api";

import type { CreationController } from "../controllers/creation";
import { useOrganizationSchema } from "./form-schema";
import styles from "./organization.module.css";

export const OrganizationCreationForm = ({
  controller,
  onClose,
  onPending,
}: {
  controller: CreationController;
  onClose: () => void;
  onPending: (pending: boolean) => void;
}) => {
  const hydrated = useHydrated();
  const { t } = useTranslation("administration");
  const initial = controller.initial;
  const [addressEdited, setAddressEdited] = useState(
    Boolean(initial.slug && initial.slug !== suggestSlug(initial.name)),
  );

  const { form, submission } = useForm({
    defaultValues: initial,
    schema: useOrganizationSchema(createOrganizationInput),
    onChange: controller.change,
    submitErrorMessage: t("errors.unavailable"),
    onSubmit: async (values) => {
      const failure = await controller.submit(values);
      if (failure) {
        return t(`errors.${failure.status}`);
      }

      return null;
    },
  });

  useEffect(() => onPending(submission.isSubmitting), [onPending, submission.isSubmitting]);

  return (
    <Form
      label={t("create")}
      submission={{ ...submission, isSubmitting: !hydrated || submission.isSubmitting }}
      actions={
        <FormActions
          submission={submission}
          onCancel={onClose}
          cancelLabel={t("closeEditor")}
          discard={{
            label: t("discard"),
            onPress: () => {
              controller.discard();
              onClose();
            },
          }}
          submitLabel={t("create")}
          submittingLabel={t("creating")}
        />
      }
    >
      <div className={styles.fields}>
        <form.Field name="name">
          {(field) => (
            <FormTextField
              field={field}
              label={t("name")}
              isRequired
              autoFocus
              onBlur={() => {
                if (!addressEdited) {
                  form.setFieldValue("slug", suggestSlug(field.state.value));
                }
              }}
            />
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <FormTextField
              field={field}
              label={t("address")}
              description={
                t("addressDescription") +
                (field.state.value
                  ? ` ${t("addressPreview", { address: `/app/${field.state.value}/rounds` })}`
                  : "")
              }
              isRequired
              onBlur={() =>
                setAddressEdited(field.state.value !== suggestSlug(form.getFieldValue("name")))
              }
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <FormTextField
              field={field}
              label={t("email")}
              type="email"
              description={t("createEmailDescription")}
              isRequired
            />
          )}
        </form.Field>
      </div>
    </Form>
  );
};
