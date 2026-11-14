import { Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormDialog } from "@merit/forms";
import { Button } from "@merit/ui/button";
import { DialogContent } from "@merit/ui/dialog";
import { EditorLoading } from "@merit/ui/editor-loading";
import linkStyles from "@merit/ui/link.module.css";
import { Notice } from "@merit/ui/notice";

import { useOrganizationCreation } from "./controllers/creation";
import { useAdminDrafts } from "./controllers/drafts";
import { useCreationData } from "./data/organization";
import { OrganizationCreationForm } from "./views/organization-creation";

export const CreateOrganization = () => {
  const { t } = useTranslation("administration");
  const hydrated = useHydrated();
  const navigate = useNavigate();
  const drafts = useAdminDrafts();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [committedId, setCommittedId] = useState<string | null>(null);

  const onCreated = async (organizationId: string) => {
    setCommittedId(organizationId);
    setPending(false);
    try {
      await navigate({
        to: "/admin/organizations/$organizationId",
        params: { organizationId },
      });
      setOpen(false);
    } catch {
      setOpen(true);
    }
  };

  return (
    <FormDialog
      title={t("create")}
      closeLabel={t("closeEditor")}
      isOpen={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (open) {
          setCommittedId(null);
        }
      }}
      isDismissDisabled={pending}
      trigger={
        <Button size="small" isDisabled={!hydrated}>
          {t(drafts.creation ? "resumeCreation" : "create")}
        </Button>
      }
    >
      {open &&
        (committedId ? (
          <DialogContent label={t("created")}>
            <Notice as="div" tone="success">
              <p>{t("created")}</p>
              <Link
                to="/admin/organizations/$organizationId"
                params={{ organizationId: committedId }}
                className={`${linkStyles.text} ${linkStyles.standalone}`}
                onClick={(event) => {
                  if (
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey &&
                    event.button === 0
                  ) {
                    setOpen(false);
                  }
                }}
              >
                {t("continue")}
              </Link>
            </Notice>
          </DialogContent>
        ) : !drafts.creationReady ? (
          <DialogContent label={t("create")}>
            <EditorLoading />
          </DialogContent>
        ) : (
          <CreateOrganizationForm
            onClose={() => setOpen(false)}
            onPending={setPending}
            onCreated={onCreated}
          />
        ))}
    </FormDialog>
  );
};

const CreateOrganizationForm = ({
  onClose,
  onPending,
  onCreated,
}: {
  onClose: () => void;
  onPending: (pending: boolean) => void;
  onCreated: (organizationId: string) => Promise<void>;
}) => {
  const data = useCreationData();
  const controller = useOrganizationCreation(data, onCreated);
  return (
    <OrganizationCreationForm controller={controller} onClose={onClose} onPending={onPending} />
  );
};
