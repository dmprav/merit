import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Inline, Stack } from "@merit/ui/layout";
import { StateMessage } from "@merit/ui/state-message";

import { StandalonePage } from "../../../components/standalone-page";
import type { DemoState } from "../contracts";
import styles from "./demo-entry.module.css";

const entryMessages = {
  expired: {
    title: "demoWorkspace.expired",
    description: "demoWorkspace.expiredDescription",
    action: "demoWorkspace.startFresh",
  },
  unavailable: {
    title: "demoWorkspace.unavailable",
    description: "demoWorkspace.retryDescription",
    action: "common:tryAgain",
  },
} as const;

export const DemoEntryView = ({
  state,
  pending,
  hydrated,
  start,
}: {
  state: DemoState;
  pending: boolean;
  hydrated: boolean;
  start: (fresh: boolean, guided?: boolean) => Promise<void>;
}) => {
  const { t } = useTranslation(["web", "common"]);
  const messages = entryMessages[state.status === "expired" ? "expired" : "unavailable"];

  if (state.status === "empty" && !pending) {
    return (
      <StandalonePage>
        <Stack gap={6}>
          <header>
            <Stack gap={3}>
              <h1 className={styles.title}>{t("demoWorkspace.introduction.title")}</h1>
              <p>{t("demoWorkspace.introduction.role")}</p>
            </Stack>
          </header>
          <Stack as="section" gap={2} aria-labelledby="demo-scenario">
            <h2 id="demo-scenario" className={styles.scenarioTitle}>
              {t("demoWorkspace.introduction.scenarioTitle")}
            </h2>
            <p>{t("demoWorkspace.introduction.scenario")}</p>
          </Stack>
          <Stack gap={4}>
            <p className={styles.lifetime}>{t("demoWorkspace.introduction.lifetime")}</p>
            <Inline gap={3}>
              <Button isDisabled={!hydrated} onPress={() => void start(false, true)}>
                {t("demoWorkspace.introduction.exploreExample")}
              </Button>
              <Button
                variant="secondary"
                isDisabled={!hydrated}
                onPress={() => void start(false, false)}
              >
                {t("demoWorkspace.introduction.browseWorkspace")}
              </Button>
            </Inline>
          </Stack>
        </Stack>
      </StandalonePage>
    );
  }

  return (
    <StandalonePage>
      <StateMessage
        title={t(pending ? "demoWorkspace.loading" : messages.title)}
        description={pending ? undefined : t(messages.description)}
        actions={
          pending ? undefined : (
            <Button
              isDisabled={!hydrated}
              onPress={() => {
                void start(state.status === "expired");
              }}
            >
              {t(messages.action)}
            </Button>
          )
        }
      />
    </StandalonePage>
  );
};
