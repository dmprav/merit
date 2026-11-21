import { Trans, useTranslation } from "react-i18next";

import { Form, FormActions, FormDialog, FormTextField } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { Link } from "@merit/ui/link";
import { Text } from "@merit/ui/text";
import { showToast } from "@merit/ui/toast";

import type { RequestAccess } from "../contracts";
import { useAccessRequest } from "../controllers/use-access-request";
import styles from "./access-request.module.css";

export const AccessRequestDialog = ({
  request,
  hydrated,
}: {
  request: RequestAccess;
  hydrated: boolean;
}) => {
  const { t } = useTranslation("onboarding");
  const { open, setOpen, hasDraft, setHasDraft, form, submission } = useAccessRequest(request, () =>
    showToast({ tone: "success", message: t("request.saved") }),
  );

  return (
    <FormDialog
      title={t("request.title")}
      trigger={
        <Button size="medium" variant="inline" isDisabled={!hydrated}>
          {t(hasDraft ? "request.resume" : "request.title")}
        </Button>
      }
      isOpen={open}
      isDismissDisabled={submission.isSubmitting}
      onOpenChange={setOpen}
    >
      <Form
        label={t("request.title")}
        submission={submission}
        actions={
          <FormActions
            submission={submission}
            onCancel={() => setOpen(false)}
            cancelLabel={t("request.close")}
            discard={
              hasDraft
                ? {
                    label: t("request.discard"),
                    onPress: () => {
                      form.reset();
                      setHasDraft(false);
                      setOpen(false);
                    },
                  }
                : undefined
            }
            submitLabel={t("request.submit")}
            submittingLabel={t("request.submitting")}
          />
        }
      >
        <div className={styles.content}>
          <p>{t("request.prototype")}</p>
          <div className={styles.field}>
            <form.Field name="email">
              {(field) => (
                <FormTextField
                  field={field}
                  label={t("request.email")}
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
                i18nKey="request.privacyFootnote"
                components={{
                  privacy: (
                    <Link
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("request.privacyNewTab")}
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
