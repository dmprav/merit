import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// jsdom has no layout, so nothing scrolls into view; browser checks cover revealed content.
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value: () => {},
});

afterEach(cleanup);
