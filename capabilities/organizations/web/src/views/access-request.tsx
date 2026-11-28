import { Trans, useTranslation } from "react-i18next";

import { Form, FormActions, FormDialog, FormTextField } from "@merit/forms";
import type { OrganizationService } from "@merit/organizations/api";
import { Button } from "@merit/ui/button";
import { Link } from "@merit/ui/link";
import { Text } from "@merit/ui/text";
import { showToast } from "@merit/ui/toast";

import { useAccessRequest } from "../controllers/use-access-request";
import styles from "./access-request.module.css";

export const AccessRequestDialog = ({
  request,
  hydrated,
}: {
  request: OrganizationService["requestAccess"];
  hydrated: boolean;
}) => {
  const { t } = useTranslation("accessRequest");
  const { open, setOpen, hasDraft, setHasDraft, form, submission } = useAccessRequest(request, () =>
    showToast({ tone: "success", message: t("saved") }),
  );

  return (
    <FormDialog
      title={t("title")}
      trigger={
        <Button variant="inline" isDisabled={!hydrated}>
          {t(hasDraft ? "resume" : "title")}
        </Button>
      }
      isOpen={open}
      isDismissDisabled={submission.isSubmitting}
      onOpenChange={setOpen}
    >
      <Form
        label={t("title")}
        submission={submission}
        actions={
          <FormActions
            submission={submission}
            onCancel={() => setOpen(false)}
            cancelLabel={t("close")}
            discard={
              hasDraft
                ? {
                    label: t("discard"),
                    onPress: () => {
                      form.reset();
                      setHasDraft(false);
                      setOpen(false);
                    },
                  }
                : undefined
            }
            submitLabel={t("submit")}
            submittingLabel={t("submitting")}
          />
        }
      >
        <div className={styles.content}>
          <p>{t("prototype")}</p>
          <div className={styles.field}>
            <form.Field name="email">
              {(field) => (
                <FormTextField
                  field={field}
                  label={t("email")}
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  isRequired
                  autoFocus
                />
              )}
            </form.Field>
            <Text as="p" variant="supporting">
              <Trans
                t={t}
                i18nKey="privacyFootnote"
                components={{
                  privacy: (
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("privacyNewTab")}
                    />
                  ),
                }}
              />
            </Text>
          </div>
        </div>
      </Form>
    </FormDialog>
  );
};
