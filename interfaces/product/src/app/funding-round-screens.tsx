import { Link, type LinkOptions } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { ApplicationWork } from "../features/grantmaking/application-work";
import { FundingRoundWork } from "../features/grantmaking/funding-round-work";
import { FundingRoundsWork } from "../features/grantmaking/funding-rounds-work";
import { PinButton } from "../features/navigation/pin-button";
import { AppPage } from "./app-shell";

export const FundingRoundsScreen = (props: ComponentProps<typeof FundingRoundsWork>) => {
  const { t } = useTranslation("web");
  return (
    <AppPage width="full" breadcrumb={[t("navigation.rounds")]}>
      <FundingRoundsWork {...props} />
    </AppPage>
  );
};

export const FundingRoundScreen = (props: ComponentProps<typeof FundingRoundWork>) => {
  const { t } = useTranslation("web");

  return (
    <AppPage
      width="full"
      breadcrumbAction={
        <PinButton
          target={{ kind: "round", id: props.data.round.id }}
          title={props.data.round.title}
        />
      }
      breadcrumb={[
        <Link key="rounds" {...props.roundsLocation} activeOptions={{ exact: true }}>
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
      breadcrumbAction={
        <PinButton
          target={{ kind: "application", id: props.data.application.id }}
          title={props.data.application.title}
        />
      }
      breadcrumb={[
        ...(applicationsLocation
          ? [
              <Link key="applications" {...applicationsLocation} activeOptions={{ exact: true }}>
                {t("navigation.applications")}
              </Link>,
            ]
          : [
              <Link key="rounds" {...roundsLocation} activeOptions={{ exact: true }}>
                {t("navigation.rounds")}
              </Link>,
              <Link key="round" {...props.roundLocation} activeOptions={{ exact: true }}>
                {props.data.round.title}
              </Link>,
            ]),
        props.data.application.title,
      ]}
    >
      <ApplicationWork {...props} returnLocation={applicationsLocation} />
    </AppPage>
  );
};
