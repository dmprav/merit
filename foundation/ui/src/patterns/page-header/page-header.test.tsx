import { act, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { PageHeader } from "./page-header";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("republishes its offset when the viewport height alone stops the header sticking", () => {
  let sticky = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    () => ({ position: sticky ? "sticky" : "static" }) as CSSStyleDeclaration,
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: 80,
  } as DOMRect);

  const { container } = render(<PageHeader title="Round" />);
  const page = container as HTMLElement;
  expect(page.style.getPropertyValue("--page-header-height")).toBe("80px");

  sticky = false;
  act(() => listeners.forEach((listener) => listener()));

  expect(page.style.getPropertyValue("--page-header-height")).toBe("0px");
});
