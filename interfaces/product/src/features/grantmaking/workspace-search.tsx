import { Link, useRouter, type LinkOptions } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  WorkspaceSearchDialog,
  type SearchDestination,
  type SearchLinks,
} from "@merit/grantmaking-web/search";

import { resourceRef } from "./contracts/resource-url";
import { workspaceSearchData } from "./data/workspace-search";

// A result opens its record directly, without a `from` parameter, so the application's
// back link leads to its round, as it does from a pin.
const destinationLocation = (workspaceSlug: string, destination: SearchDestination): LinkOptions =>
  destination.kind === "round"
    ? {
        to: "/app/$workspaceSlug/rounds/$roundRef",
        params: {
          workspaceSlug,
          roundRef: resourceRef(destination.round.title, destination.round.id),
        },
      }
    : {
        to: "/app/$workspaceSlug/applications/$applicationRef",
        params: {
          workspaceSlug,
          applicationRef: resourceRef(destination.application.title, destination.application.id),
        },
      };

/** Search the workspace's funding rounds and applications from anywhere in it. */
export const WorkspaceSearch = ({
  workspaceSlug,
  isOpen,
  onOpenChange,
  focusRequest,
}: {
  workspaceSlug: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  focusRequest: number;
}) => {
  const router = useRouter();
  const data = useMemo(() => workspaceSearchData(workspaceSlug), [workspaceSlug]);
  const links = useMemo<SearchLinks>(
    () => ({
      href: (destination) =>
        router.buildLocation(destinationLocation(workspaceSlug, destination)).href,
      // The router computes the same address, so the row's own `href` is not passed on.
      render: (destination, { href: _href, ...props }) => (
        <Link {...destinationLocation(workspaceSlug, destination)} {...props} />
      ),
    }),
    [router, workspaceSlug],
  );

  return (
    <WorkspaceSearchDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      data={data}
      links={links}
      focusRequest={focusRequest}
    />
  );
};
