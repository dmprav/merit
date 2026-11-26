import type { ReactNode } from "react";

import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";

/**
 * Viewport-contained application work in Storybook: the shell scrolling contract
 * without workspace navigation or breadcrumb chrome.
 */
export const ApplicationContainedPreview = ({
  locationKey,
  width,
  children,
}: {
  locationKey: string;
  width?: "standard" | "full";
  children: ReactNode;
}) => (
  <ApplicationStage>
    <ApplicationPage
      contained
      width={width}
      locationKey={locationKey}
      breadcrumb={null}
      breadcrumbLabel="Breadcrumb"
    >
      {children}
    </ApplicationPage>
  </ApplicationStage>
);

export { FundingRoundPreview, applicationOverviewForPreview } from "./application-list-preview";
