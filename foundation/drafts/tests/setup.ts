import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

import { resetDraftStorage } from "../testing";

afterEach(async () => {
  cleanup();
  await resetDraftStorage();
  sessionStorage.clear();
});
