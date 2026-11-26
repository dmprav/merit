import { QueryClientProvider } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { createQueryClient } from "@merit/query";
import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";

import type { CreatedRecord, CreationData } from "../contracts/creation";
import { GrantmakingMessagesProvider } from "../messages";
import { CreateAction } from "../views/creation/creation-composer";
import { GrantmakingDrafts } from "../views/drafts";

/** Real creation interaction, with in-memory drafts and simulated transport/navigation. */
export const ComposerPreview = ({
  application = false,
  failure = false,
  pending = false,
  roundTitle = "Community grants",
}: {
  application?: boolean;
  failure?: boolean;
  pending?: boolean;
  roundTitle?: string;
}) => {
  const [client] = useState(createQueryClient);
  const [opened, setOpened] = useState<CreatedRecord | null>(null);
  const failedOnce = useRef(false);
  const data: CreationData = {
    draftKey: application ? "preview-application" : "preview-round",
    target: application
      ? { kind: "application", workspaceSlug: "alder", roundPublicId: "k7m2p9x4n6rt", roundTitle }
      : { kind: "round", workspaceSlug: "alder", workspaceName: "Alder Foundation" },
    create: async () => {
      if (pending) {
        return new Promise(() => {});
      }
      if (failure && !failedOnce.current) {
        failedOnce.current = true;
        return { status: "unavailable" };
      }
      return { status: "ok", publicId: "k7m2p9x4n6rt" };
    },
    refresh: async () => {},
    open: async (record) => setOpened(record),
  };

  return (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <ApplicationStage>
          <ApplicationPage
            width="full"
            locationKey="create"
            breadcrumb={null}
            breadcrumbLabel="Breadcrumb"
          >
            <GrantmakingDrafts>
              <CreateAction data={data} />
              {opened && (
                <section aria-label="Created record">
                  <h2>{opened.title}</h2>
                </section>
              )}
            </GrantmakingDrafts>
          </ApplicationPage>
        </ApplicationStage>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );
};
