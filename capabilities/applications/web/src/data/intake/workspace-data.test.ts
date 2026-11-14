import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vite-plus/test";

import { createIntakeData } from "./workspace-data";

it("namespaces intake draftKey by workspaceSlug and application publicId", () => {
  const client = new QueryClient();
  const state = { revision: 0, workingRevision: null, history: [] };
  const source = {
    applicationScope: ["app"],
    grantWorkScope: ["grant"],
    editApplication: vi.fn(),
    selectContact: vi.fn(),
  };

  const alder = createIntakeData(
    client,
    { workspaceSlug: "alder", publicId: "shared-id", state },
    source,
  );
  const birch = createIntakeData(
    client,
    { workspaceSlug: "birch", publicId: "shared-id", state },
    source,
  );

  expect(alder.draftKey).toBe("alder/shared-id");
  expect(birch.draftKey).toBe("birch/shared-id");
  expect(alder.draftKey).not.toBe(birch.draftKey);
});
