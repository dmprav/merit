import { useTranslation } from "react-i18next";

import { Button } from "@merit/ui/button";
import { Inline, Stack } from "@merit/ui/layout";
import { PageHeader } from "@merit/ui/page-header";
import { SectionHeader } from "@merit/ui/section-header";
import { StateMessage } from "@merit/ui/state-message";
import { Text } from "@merit/ui/text";

import { StandalonePage } from "../../../components/standalone-page";
import type { DemoState } from "../contracts";

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
          <div>
            <PageHeader title={t("demoWorkspace.introduction.title")} density="compact" />
            <p>{t("demoWorkspace.introduction.role")}</p>
          </div>
          <section aria-labelledby="demo-scenario">
            <SectionHeader
              id="demo-scenario"
              title={t("demoWorkspace.introduction.scenarioTitle")}
            />
            <p>{t("demoWorkspace.introduction.scenario")}</p>
          </section>
          <Stack gap={4}>
            <Text as="p" variant="supporting">
              {t("demoWorkspace.introduction.lifetime")}
            </Text>
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
