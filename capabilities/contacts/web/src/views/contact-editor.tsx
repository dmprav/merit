import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { contactDetailsSchema, type ContactDetails } from "@merit/contacts/domain";
import { Form, FormActions, FormTextField, useForm, useTranslatedSchema } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { Inline, Stack } from "@merit/ui/layout";
import { Notice } from "@merit/ui/notice";

import type { Contact, ContactsData } from "../contracts";
import { useContactEditor } from "../controllers/contact-editor";
import type { useContactDrafts } from "../controllers/drafts";
import { ContactDetails as SavedContactDetails } from "./contact-details";
import styles from "./contacts.module.css";

const ContactForm = ({
  value,
  onChange,
  onSave,
  onClose,
  onDiscard,
  conflict,
  children,
}: {
  children?: ReactNode;
  conflict: boolean;
  value: ContactDetails;
  onChange: (value: ContactDetails) => void;
  onSave: (value: ContactDetails) => Promise<string | null>;
  onClose: () => void;
  onDiscard: () => void;
}) => {
  const { t } = useTranslation("contacts");
  const { form, submission } = useForm({
    defaultValues: value,
    schema: useTranslatedSchema(contactDetailsSchema, (issue) =>
      issue.code === "custom" && issue.params?.reason === "name_or_email_required"
        ? t("validation.nameOrEmailRequired")
        : undefined,
    ),
    onChange,
    onSubmit: onSave,
    submitErrorMessage: t("error"),
  });

  return (
    <Form
      label={t("editContact")}
      submission={submission}
      actions={
        <FormActions
          submission={submission}
          onCancel={onClose}
          cancelLabel={t("close")}
          discard={{ label: t("discard"), onPress: onDiscard }}
          submitLabel={t("save")}
          submittingLabel={t("saving")}
          isSubmitDisabled={conflict}
        />
      }
    >
      <Stack>
        {children}
        <p>{t("sharedDetails")}</p>
        <form.Field name="name">
          {(field) => <FormTextField field={field} label={t("name")} autoFocus maxLength={200} />}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <FormTextField field={field} label={t("email")} type="email" maxLength={320} />
          )}
        </form.Field>
        <form.Field name="affiliation">
          {(field) => <FormTextField field={field} label={t("affiliation")} maxLength={200} />}
        </form.Field>
        <p className={styles.meta}>{t("noAccessGranted")}</p>
      </Stack>
    </Form>
  );
};

export const ContactEditor = (props: {
  workspaceSlug: string;
  contact?: Contact;
  data: ContactsData;
  onSaved: (contact: Contact) => void;
  onClose: () => void;
  onPending: (pending: boolean) => void;
  draftStore: ReturnType<typeof useContactDrafts>;
}) => {
  const { t } = useTranslation("contacts");
  const editor = useContactEditor(props);
  const { current, conflict, baseline, value } = editor;

  return (
    <ContactForm
      key={baseline ?? "new"}
      conflict={conflict}
      value={value}
      onChange={editor.change}
      onClose={props.onClose}
      onDiscard={editor.discard}
      onSave={editor.save}
    >
      {conflict && current && (
        <Notice as="div" tone="warning">
          <p>{t("conflict")}</p>
          <p>{t("savedContactDetails")}</p>
          <SavedContactDetails value={current} />
          <Inline>
            <Button variant="secondary" onPress={editor.useSaved}>
              {t("useSaved")}
            </Button>
            <Button variant="secondary" onPress={editor.keepDraft}>
              {t("keepDraft")}
            </Button>
          </Inline>
        </Notice>
      )}
    </ContactForm>
  );
};
