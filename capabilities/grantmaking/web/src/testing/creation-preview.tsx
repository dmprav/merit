import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

import { createQueryClient } from "@merit/query";
import { Button } from "@merit/ui/button";

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
  const data: CreationData = {
    draftKey: application ? "preview-application" : "preview-round",
    target: application
      ? { kind: "application", workspaceSlug: "alder", roundPublicId: "k7m2p9x4n6rt", roundTitle }
      : { kind: "round", workspaceSlug: "alder", workspaceName: "Alder Foundation" },
    create: async () =>
      pending
        ? new Promise(() => {})
        : failure
          ? { status: "unavailable" }
          : { status: "ok", publicId: "k7m2p9x4n6rt" },
    refresh: async () => {},
    open: async (record) => setOpened(record),
  };

  return (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <GrantmakingDrafts>
          <CreateAction
            data={data}
            renderCreatedLink={(record, label) => (
              <Button variant="quiet" onPress={() => setOpened(record)}>
                {label}
              </Button>
            )}
          />
          {opened && (
            <section aria-label="Created record">
              <h2>{opened.title}</h2>
            </section>
          )}
        </GrantmakingDrafts>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );
};
