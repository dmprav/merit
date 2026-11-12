import { expect, it } from "vite-plus/test";

import { clearDrafts } from "@merit/drafts";
import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";

it("clears only the replaced demo's drafts and leaves real and other demo work alone", async () => {
  const scopes = ["account", "account:demo:old", "account:demo:other"];
  for (const scope of scopes) {
    await seedDraftStorage(scope, "recommendations", { record: "draft" });
  }

  await clearDrafts("account:demo:old");

  expect(await readDraftStorage(scopes[1]!, "recommendations")).toEqual({});
  for (const scope of [scopes[0]!, scopes[2]!]) {
    expect(await readDraftStorage(scope, "recommendations")).toEqual({ record: "draft" });
  }

  await clearDrafts();

  for (const scope of scopes) {
    expect(await readDraftStorage(scope, "recommendations")).toEqual({});
  }
});
