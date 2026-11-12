import { Link, type LinkOptions } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { Inline } from "@merit/ui/layout";

import { ApplicationWork } from "../features/grantmaking/application-work";
import { FundingRoundWork } from "../features/grantmaking/funding-round-work";
import { FundingRoundsWork } from "../features/grantmaking/funding-rounds-work";
import { PinButton } from "../features/navigation/pin-button";
import { AppPage } from "./app-shell";

export const FundingRoundsScreen = (props: ComponentProps<typeof FundingRoundsWork>) => {
  const { t } = useTranslation("web");
  return (
    <AppPage breadcrumb={[t("navigation.rounds")]}>
      <FundingRoundsWork {...props} />
    </AppPage>
  );
};

export const FundingRoundScreen = (props: ComponentProps<typeof FundingRoundWork>) => {
  const { t } = useTranslation("web");

  return (
    <AppPage
      width="full"
      badge={
        <PinButton
          target={{ kind: "round", id: props.data.round.id }}
          title={props.data.round.title}
        />
      }
      breadcrumb={[
        <Link key="rounds" {...props.roundsLocation}>
          {t("navigation.rounds")}
        </Link>,
        props.data.round.title,
      ]}
    >
      <FundingRoundWork {...props} />
    </AppPage>
  );
};

export const ApplicationScreen = ({
  roundsLocation,
  applicationsLocation,
  ...props
}: ComponentProps<typeof ApplicationWork> & {
  roundsLocation: LinkOptions;
  applicationsLocation?: LinkOptions;
}) => {
  const { t } = useTranslation("web");

  return (
    <AppPage
      contained
      badge={
        <Inline gap={3}>
          {applicationsLocation && (
            <Link {...applicationsLocation}>{t("navigation.backToApplications")}</Link>
          )}
          <PinButton
            target={{ kind: "application", id: props.data.application.id }}
            title={props.data.application.title}
          />
        </Inline>
      }
      breadcrumb={[
        <Link key="rounds" {...roundsLocation}>
          {t("navigation.rounds")}
        </Link>,
        <Link key="round" {...props.roundLocation}>
          {props.data.round.title}
        </Link>,
        props.data.application.title,
      ]}
    >
      <ApplicationWork {...props} returnLocation={applicationsLocation} />
    </AppPage>
  );
};
