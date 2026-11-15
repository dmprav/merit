import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { CreateAction, type CreationData } from "@merit/grantmaking-web/creation";
import linkStyles from "@merit/ui/link.module.css";

import { creationLocation } from "./contracts/creation-location";

export const WorkspaceCreateAction = ({
  data,
  locationKey,
  renderTrigger,
  restoreTriggerFocus,
}: {
  data: CreationData;
  locationKey?: string;
  renderTrigger?: ComponentProps<typeof CreateAction>["renderTrigger"];
  restoreTriggerFocus?: () => void;
}) => (
  <CreateAction
    data={data}
    locationKey={locationKey}
    renderTrigger={renderTrigger}
    restoreTriggerFocus={restoreTriggerFocus}
    renderCreatedLink={(record, label) => (
      <Link className={linkStyles.text} {...creationLocation(data.target, record)}>
        {label}
      </Link>
    )}
  />
);
