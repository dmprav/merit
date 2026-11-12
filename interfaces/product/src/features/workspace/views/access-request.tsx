import { useTranslation } from "react-i18next";

import { Form, FormActions, FormDialog, FormTextField } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { DialogContent } from "@merit/ui/dialog";
import linkStyles from "@merit/ui/link.module.css";
import { Notice } from "@merit/ui/notice";

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
  const { open, setOpen, saved, setSaved, hasDraft, setHasDraft, form, submission } =
    useAccessRequest(request);

  return (
    <FormDialog
      title={t("request.title")}
      closeLabel={t("request.close")}
      trigger={
        <Button variant="quiet" className={styles.trigger} isDisabled={!hydrated}>
          {t(hasDraft ? "request.resume" : "request.title")}
        </Button>
      }
      isOpen={open}
      isDismissDisabled={submission.isSubmitting}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setSaved(false);
        }
      }}
    >
      {saved ? (
        <DialogContent
          label={t("request.title")}
          footer={<Button onPress={() => setOpen(false)}>{t("request.close")}</Button>}
        >
          <Notice role="status" tone="neutral">
            {t("request.saved")}
          </Notice>
        </DialogContent>
      ) : (
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
            <p className={styles.note}>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={linkStyles.text}
                aria-label={t("request.privacyNewTab")}
              >
                {t("request.privacy")}
              </a>
            </p>
          </div>
        </Form>
      )}
    </FormDialog>
  );
};
