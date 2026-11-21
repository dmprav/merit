import { useTranslation } from "react-i18next";

import { formatCalendarDate } from "@merit/dates";
import { useLocaleSettings } from "@merit/i18n";
import { Button } from "@merit/ui/button";
import { ConfirmationDialog } from "@merit/ui/confirmation-dialog";
import { DialogSection, PopoverDialog } from "@merit/ui/dialog";
import { Icon } from "@merit/ui/icon";
import { Inline, Stack } from "@merit/ui/layout";
import { Text } from "@merit/ui/text";

import { RoutedLink } from "../../../shared/routed-link";
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
        isOpen={open}
        onOpenChange={setOpen}
        footer={
          <div className={styles.workspaceActions}>
            <Inline gap={1}>
              <RoutedLink variant="quiet" to="/">
                <Icon name="exit" />
                {t("fundingRounds:demo.exit")}
              </RoutedLink>
              <Button
                size="medium"
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
          </div>
        }
        trigger={
          <Button variant="secondary" isDisabled={!hydrated}>
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
    <div>
      {workspace.demoExpiresAt && (
        <div className={styles.expiry}>
          <Text as="p" variant="caption">
            {t("demoWorkspace.expires", {
              date: formatCalendarDate(workspace.demoExpiresAt.slice(0, 10), formatLocale),
            })}
          </Text>
        </div>
      )}
      <p>{t("demoWorkspace.introduction.role")}</p>
      <DialogSection title={t("fundingRounds:journey.title")}>
        <p>{t("demoWorkspace.introduction.scenario")}</p>
        <div className={styles.tasks}>
          <Stack gap={1}>
            {loading ? (
              <p role="status">{t("demoWorkspace.loadingTasks")}</p>
            ) : destinations ? (
              <>
                {destinations.applicationRef && (
                  <RoutedLink
                    variant="standalone"
                    to="/app/$workspaceSlug/applications/$applicationRef"
                    params={{
                      workspaceSlug: workspace.slug,
                      applicationRef: destinations.applicationRef,
                    }}
                    search={{ tab: "reviews" }}
                    onClick={close}
                  >
                    {t("fundingRounds:journey.application")}
                  </RoutedLink>
                )}
                {destinations.roundRef && (
                  <RoutedLink
                    variant="standalone"
                    to="/app/$workspaceSlug/rounds/$roundRef"
                    params={{ workspaceSlug: workspace.slug, roundRef: destinations.roundRef }}
                    search={{ section: "applications" }}
                    onClick={close}
                  >
                    {t("fundingRounds:journey.budget")}
                  </RoutedLink>
                )}
                {(!destinations.applicationRef || !destinations.roundRef) && (
                  <>
                    <p>{t("demoWorkspace.missingTasks")}</p>
                    <RoutedLink
                      variant="standalone"
                      to="/app/$workspaceSlug/rounds"
                      params={{ workspaceSlug: workspace.slug }}
                      onClick={close}
                    >
                      {t("demoWorkspace.exploreRounds")}
                    </RoutedLink>
                  </>
                )}
              </>
            ) : (
              <>
                <p role="status">{t("demoWorkspace.tasksError")}</p>
                <Inline>
                  <Button size="medium" variant="secondary" onPress={retry}>
                    {t("common:tryAgain")}
                  </Button>
                </Inline>
              </>
            )}
          </Stack>
        </div>
      </DialogSection>
    </div>
  );
};
