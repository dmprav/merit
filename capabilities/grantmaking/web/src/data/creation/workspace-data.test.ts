import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vite-plus/test";

import { createCreationData } from "./workspace-data";

it("namespaces round and application creation draftKeys by kind and workspaceSlug", () => {
  const client = new QueryClient();
  const source = {
    grantWorkScope: ["grant"],
    createRound: vi.fn(),
    createApplication: vi.fn(),
    open: vi.fn(),
  };

  const alderRound = createCreationData(
    client,
    { kind: "round", workspaceSlug: "alder", workspaceName: "Alder" },
    source,
  );
  const birchRound = createCreationData(
    client,
    { kind: "round", workspaceSlug: "birch", workspaceName: "Birch" },
    source,
  );
  const alderApplication = createCreationData(
    client,
    {
      kind: "application",
      workspaceSlug: "alder",
      roundPublicId: "round-1",
      roundTitle: "Round 1",
    },
    source,
  );
  const birchApplication = createCreationData(
    client,
    {
      kind: "application",
      workspaceSlug: "birch",
      roundPublicId: "round-1",
      roundTitle: "Round 1",
    },
    source,
  );

  expect(
    new Set([
      alderRound.draftKey,
      birchRound.draftKey,
      alderApplication.draftKey,
      birchApplication.draftKey,
    ]).size,
  ).toBe(4);
  expect(alderRound.draftKey).toContain("alder");
  expect(alderApplication.draftKey).toContain("alder");
  expect(birchApplication.draftKey).toContain("birch");
});
