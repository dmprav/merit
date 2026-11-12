import { Link } from "@tanstack/react-router";

import { CreateAction, type CreationData } from "@merit/grantmaking-web/creation";
import linkStyles from "@merit/ui/link.module.css";

import { creationLocation } from "./contracts/creation-location";

export const WorkspaceCreateAction = ({ data }: { data: CreationData }) => (
  <CreateAction
    data={data}
    renderCreatedLink={(record, label) => (
      <Link className={linkStyles.text} {...creationLocation(data.target, record)}>
        {label}
      </Link>
    )}
  />
);
