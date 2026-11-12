import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { formatCalendarDate } from "@merit/dates";
import { useLocaleSettings } from "@merit/i18n";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { PopoverDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import linkStyles from "@merit/ui/link.module.css";

import type { useDemoReset } from "../controllers/use-demo-reset";
import styles from "./demo-tools.module.css";

type DemoToolsViewProps = {
  workspace: { slug: string; demoExpiresAt?: string | null };
  hydrated: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  destinations?: { applicationRef?: string; roundRef?: string };
  loading: boolean;
  retry: () => void;
  reset: ReturnType<typeof useDemoReset>;
};

export const DemoToolsView = ({
  workspace,
  hydrated,
  open,
  setOpen,
  destinations,
  loading,
  retry,
  reset,
}: DemoToolsViewProps) => {
  const { t } = useTranslation(["web", "fundingRounds", "common"]);

  return (
    <>
      <PopoverDialog
        title={t("fundingRounds:demo.guide")}
        closeLabel={t("fundingRounds:demo.closeGuide")}
        isOpen={open}
        onOpenChange={setOpen}
        footer={
          <Inline gap={1} className={styles.workspaceActions}>
            <Link to="/" className={linkStyles.button} data-variant="quiet">
              <Icon name="exit" />
              {t("fundingRounds:demo.exit")}
            </Link>
            <Button
              variant="quiet"
              onPress={() => {
                reset.open();
                setOpen(false);
              }}
            >
              <Icon name="reset" />
              {t("fundingRounds:demo.reset")}
            </Button>
          </Inline>
        }
        trigger={
          <Button size="small" variant="secondary" isDisabled={!hydrated}>
            <Icon name="guide" />
            {t("fundingRounds:demo.guide")}
          </Button>
        }
      >
        {({ close }) => (
          <DemoGuide
            workspace={workspace}
            destinations={destinations}
            loading={loading}
            retry={retry}
            close={close}
          />
        )}
      </PopoverDialog>
      <ConfirmationDialog
        title={t("fundingRounds:demo.resetTitle")}
        description={t("demoWorkspace.resetDescription")}
        closeLabel={t("common:closeDialog")}
        cancelLabel={t("fundingRounds:demo.keepChanges")}
        confirmLabel={t("fundingRounds:demo.reset")}
        pendingLabel={t("fundingRounds:demo.resetting")}
        intent="destructive"
        isOpen={reset.isOpen}
        onOpenChange={reset.setOpen}
        isPending={reset.pending}
        error={reset.failed ? t("demoWorkspace.resetError") : null}
        onConfirm={reset.confirm}
      />
    </>
  );
};

const DemoGuide = ({
  workspace,
  destinations,
  loading,
  retry,
  close,
}: Pick<DemoToolsViewProps, "workspace" | "destinations" | "loading" | "retry"> & {
  close: () => void;
}) => {
  const { t } = useTranslation(["web", "fundingRounds", "common"]);
  const { formatLocale } = useLocaleSettings();
  return (
    <Stack className={styles.guide}>
      <Stack gap={2}>
        {workspace.demoExpiresAt && (
          <p className={styles.expiry}>
            {t("demoWorkspace.expires", {
              date: formatCalendarDate(workspace.demoExpiresAt.slice(0, 10), formatLocale),
            })}
          </p>
        )}
        <p>{t("demoWorkspace.introduction.role")}</p>
        <h3 className={styles.title}>{t("fundingRounds:journey.title")}</h3>
        <p>{t("demoWorkspace.introduction.scenario")}</p>
      </Stack>
      <Stack gap={2}>
        {loading ? (
          <p role="status">{t("demoWorkspace.loadingTasks")}</p>
        ) : destinations ? (
          <>
            {destinations.applicationRef && (
              <Link
                to="/app/$workspaceSlug/applications/$applicationRef"
                params={{
                  workspaceSlug: workspace.slug,
                  applicationRef: destinations.applicationRef,
                }}
                search={{ tab: "reviews" }}
                onClick={close}
                className={`${linkStyles.text} ${linkStyles.standalone}`}
              >
                {t("fundingRounds:journey.application")}
              </Link>
            )}
            {destinations.roundRef && (
              <Link
                to="/app/$workspaceSlug/rounds/$roundRef"
                params={{ workspaceSlug: workspace.slug, roundRef: destinations.roundRef }}
                search={{ section: "applications" }}
                onClick={close}
                className={`${linkStyles.text} ${linkStyles.standalone}`}
              >
                {t("fundingRounds:journey.budget")}
              </Link>
            )}
            {(!destinations.applicationRef || !destinations.roundRef) && (
              <>
                <p>{t("demoWorkspace.missingTasks")}</p>
                <Link
                  to="/app/$workspaceSlug/rounds"
                  params={{ workspaceSlug: workspace.slug }}
                  onClick={close}
                  className={`${linkStyles.text} ${linkStyles.standalone}`}
                >
                  {t("demoWorkspace.exploreRounds")}
                </Link>
              </>
            )}
          </>
        ) : (
          <>
            <p role="status">{t("demoWorkspace.tasksError")}</p>
            <Inline>
              <Button variant="secondary" onPress={retry}>
                {t("common:tryAgain")}
              </Button>
            </Inline>
          </>
        )}
      </Stack>
    </Stack>
  );
};
