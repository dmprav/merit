import type { Page } from "@playwright/test";

// Bounds the wait for the page's next rendering update, which never comes while rendering is blocked.
const RENDER_UPDATE_TIMEOUT_MS = 5_000;

/**
 * Waits for the page's next rendering update. Animation frame callbacks run at its end, after
 * the update has applied pending `autofocus` and dispatched animation events.
 */
export const waitForRenderUpdate = (page: Page): Promise<void> =>
  page.evaluate(
    (timeoutMs: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        requestAnimationFrame(() => {
          clearTimeout(timer);
          resolve();
        });
      }),
    RENDER_UPDATE_TIMEOUT_MS,
  );
