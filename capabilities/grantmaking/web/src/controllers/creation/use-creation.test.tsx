import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vite-plus/test";

import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";
import { createQueryClient } from "@merit/query";

import { createCreationData } from "../../data/creation/workspace-data";
import { GrantmakingMessagesProvider } from "../../messages";
import { GrantmakingDrafts } from "../../views/drafts";
import { useCreation } from "./use-creation";

it("recovers and migrates legacy round and application creation drafts in storage", async () => {
  await seedDraftStorage("dana", "creations", {
    alder: {
      requestId: "req-round",
      title: "Recovered round draft",
      body: "Legacy round purpose",
      amount: "1000",
      meetingDate: "",
      applicant: "",
    },
    "application:r7m2p9x4n6rt": {
      requestId: "req-app",
      title: "Recovered app draft",
      body: "",
      amount: "500",
      meetingDate: "",
      applicant: "Community Group",
    },
  });

  const client = createQueryClient();
  const source = {
    grantWorkScope: ["grant"],
    createRound: vi.fn(),
    createApplication: vi.fn(),
    open: vi.fn(),
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <GrantmakingMessagesProvider>
        <GrantmakingDrafts storageScope="dana">{children}</GrantmakingDrafts>
      </GrantmakingMessagesProvider>
    </QueryClientProvider>
  );

  const roundHook = renderHook(
    () =>
      useCreation(
        createCreationData(
          client,
          { kind: "round", workspaceSlug: "alder", workspaceName: "Alder" },
          source,
        ),
      ),
    { wrapper },
  );

  await waitFor(() => expect(roundHook.result.current).not.toBeNull());
  expect(roundHook.result.current.resumable).toBe(true);
  expect(roundHook.result.current.draft?.title).toBe("Recovered round draft");

  const appHook = renderHook(
    () =>
      useCreation(
        createCreationData(
          client,
          {
            kind: "application",
            workspaceSlug: "alder",
            roundPublicId: "r7m2p9x4n6rt",
            roundTitle: "Community grants",
          },
          source,
        ),
      ),
    { wrapper },
  );

  await waitFor(() => expect(appHook.result.current).not.toBeNull());
  expect(appHook.result.current.resumable).toBe(true);
  expect(appHook.result.current.draft?.title).toBe("Recovered app draft");

  await waitFor(async () => {
    const stored = await readDraftStorage("dana", "creations");
    expect(stored).toHaveProperty("round:alder");
    expect(stored).toHaveProperty("application:alder/r7m2p9x4n6rt");
    expect(stored).not.toHaveProperty("alder");
    expect(stored).not.toHaveProperty("application:r7m2p9x4n6rt");
  });
});
