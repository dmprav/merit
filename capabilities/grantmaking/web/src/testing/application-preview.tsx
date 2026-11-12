import type { ReactNode } from "react";

import { ApplicationPage } from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";

import previewStyles from "./application-preview.module.css";

/**
 * Viewport-contained application work in Storybook: the shell scrolling contract
 * without workspace navigation or breadcrumb chrome.
 */
export const ApplicationContainedPreview = ({
  locationKey,
  children,
}: {
  locationKey: string;
  children: ReactNode;
}) => (
  <div className={`${shellStyles.shell} ${previewStyles.stageOnly}`}>
    <div className={shellStyles.stage}>
      <ApplicationPage
        contained
        locationKey={locationKey}
        breadcrumb={null}
        breadcrumbLabel="Breadcrumb"
      >
        {children}
      </ApplicationPage>
    </div>
  </div>
);
