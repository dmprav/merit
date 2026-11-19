import { useTranslation } from "react-i18next";

import { contactDetailsSchema, type ContactDetails } from "@merit/contacts/domain";
import {
  Form,
  FormActions,
  FormTextField,
  RetainedDraftNotice,
  useForm,
  useTranslatedSchema,
} from "@merit/forms";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading } from "@merit/ui/editor-loading";
import { Stack } from "@merit/ui/layout";

import type { Contact, ContactsData } from "../contracts";
import { useContactEditor } from "../controllers/contact-editor";
import type { useContactDrafts } from "../controllers/drafts";
import styles from "./contacts.module.css";

const ContactForm = ({
  value,
  onChange,
  onSave,
  onClose,
  onDiscard,
}: {
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
        />
      }
    >
      <Stack>
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

type ContactEditorProps = {
  workspaceSlug: string;
  contact?: Contact;
  data: ContactsData;
  onSaved: (contact: Contact) => void;
  onClose: () => void;
  onPending: (pending: boolean) => void;
  draftStore: ReturnType<typeof useContactDrafts>;
};

export const ContactEditor = (props: ContactEditorProps) => {
  const { t } = useTranslation("contacts");
  return props.draftStore.ready ? (
    <ReadyContactEditor {...props} />
  ) : (
    <DialogContent label={t(props.contact ? "editContact" : "addContact")}>
      <EditorLoading />
    </DialogContent>
  );
};

const ReadyContactEditor = (props: ContactEditorProps) => {
  const { t } = useTranslation("contacts");
  const editor = useContactEditor(props);
  const { missing, value } = editor;

  if (missing) {
    return (
      <DialogContent label={t("editContact")}>
        <RetainedDraftNotice
          title={t("retainedTitle")}
          message={t("missingContact")}
          textToCopy={[value.name, value.email, value.affiliation].filter(Boolean).join("\n")}
          onDiscard={editor.discard}
        />
      </DialogContent>
    );
  }

  return (
    <ContactForm
      value={value}
      onChange={editor.change}
      onClose={props.onClose}
      onDiscard={editor.discard}
      onSave={editor.save}
    />
  );
};
