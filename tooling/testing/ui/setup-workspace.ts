import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vite-plus/test";

import { resetDraftStorage } from "@merit/drafts/testing";

// jsdom has no layout or scrolling; browser checks cover the rendered layout and revealed content.
vi.spyOn(window, "scrollTo").mockImplementation(() => {});
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value: () => {},
});

// Component tests use a desktop viewport; responsive positioning is checked in the browser suite.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  }),
});

afterEach(async () => {
  cleanup();
  await resetDraftStorage();
  sessionStorage.clear();
});
