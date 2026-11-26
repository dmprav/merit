/// <reference types="vite/client" />
import type { Preview } from "@storybook/react-vite";
import { useInsertionEffect } from "react";
import { STORY_FINISHED } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";
import { sb } from "storybook/test";

import { Toasts } from "@merit/ui/toast";

import "./styles.css";

sb.mock(
  "../../../interfaces/admin/src/features/organizations/data/server/organizations.functions.ts",
);
sb.mock(
  "../../../interfaces/admin/src/features/access-requests/data/server/access-requests.functions.ts",
);
sb.mock("../../../interfaces/product/src/features/team/data/server/team.functions.ts");
sb.mock("../../../interfaces/product/src/features/demo/data/server/demo.functions.ts");
sb.mock("../../../interfaces/product/src/features/workspace/data/server/organization.functions.ts");
sb.mock("../../../interfaces/product/src/features/workspace/data/server/workspace.functions.ts");
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/funding-round.functions.ts",
);
sb.mock("../../../interfaces/product/src/features/grantmaking/data/server/activity.functions.ts");
sb.mock("../../../interfaces/product/src/features/grantmaking/data/server/search.functions.ts");
sb.mock("../../../interfaces/product/src/features/grantmaking/data/server/history.functions.ts");
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/creation/creation.functions.ts",
);
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/preparation/preparation.functions.ts",
);
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/intake/intake.functions.ts",
);
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/reviews/reviews.functions.ts",
);
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/applications/application-contact.functions.ts",
);
sb.mock(
  "../../../interfaces/product/src/features/grantmaking/data/server/reviews/reviewer.functions.ts",
);
sb.mock("../../../interfaces/product/src/features/contacts/data/server/contacts.functions.ts");
sb.mock("../../../interfaces/product/src/app/workspace-account.tsx");

const Theme = ({ product, children }: { product: boolean; children: React.ReactNode }) => {
  // Apply before child useLayoutEffect hooks measure CSS tokens such as --text-control.
  useInsertionEffect(() => {
    if (product) {
      document.documentElement.dataset.productTheme = "";
    } else {
      delete document.documentElement.dataset.productTheme;
    }

    return () => {
      delete document.documentElement.dataset.productTheme;
    };
  }, [product]);

  return children;
};

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Merit theme",
      toolbar: { icon: "paintbrush", items: ["product", "site"] },
    },
  },
  initialGlobals: { theme: "product" },
  tags: ["autodocs"],
  // Wait for interactions and addon checks before the browser suite inspects or changes the story.
  beforeEach: ({ canvasElement, id }) => {
    delete canvasElement.dataset.storyReady;
    const channel = addons.getChannel();

    const onFinished = ({
      storyId,
      status,
      reporters,
    }: {
      storyId: string;
      status: string;
      reporters?: Array<{ type: string; status: string; result?: unknown }>;
    }) => {
      if (storyId === id) {
        if (status === "success") {
          delete canvasElement.dataset.storyError;
          canvasElement.dataset.storyReady = "true";
        } else {
          const failures = (reporters ?? [])
            .filter((report) => report.status === "failed")
            .map((report) => ({ type: report.type, result: report.result }));
          canvasElement.dataset.storyError =
            failures.length > 0 ? JSON.stringify(failures) : status;
          canvasElement.dataset.storyReady = "error";
        }
      }
    };

    channel.on(STORY_FINISHED, onFinished);

    // React Aria keeps announcements outside the canvas; old labels disappear on remount.
    for (const log of canvasElement.ownerDocument.querySelectorAll(
      "[data-live-announcer] [role=log]",
    )) {
      log.replaceChildren();
    }
    return () => channel.off(STORY_FINISHED, onFinished);
  },
  // Settle CSS transitions/animations (e.g. ModalDialog fade-in) before addon-a11y measures contrast.
  afterEach: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    if (typeof doc.getAnimations !== "function") {
      return;
    }

    const finiteRunning = () =>
      doc.getAnimations().filter(
        (animation) =>
          animation.playState === "running" &&
          // Scroll-linked animations, such as dialog dividers, follow scrolling and never finish.
          animation.timeline === doc.timeline &&
          animation.effect?.getTiming().iterations !== Infinity,
      );

    let waitCycles = 0;

    while (waitCycles < 20) {
      const running = finiteRunning();
      const transitioning = doc.querySelector("[data-entering], [data-exiting]");

      if (running.length === 0 && !transitioning) {
        break;
      }

      if (running.length > 0) {
        await Promise.allSettled(running.map((animation) => animation.finished));
      } else {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      waitCycles += 1;
    }

    // Every notice places its controls the same way, so none may sit inside its message.
    if (doc.querySelector("[data-notice-message] :is(button, [role='button'])")) {
      throw new Error("Place Notice buttons in its actions, not its message.");
    }

    // Feedback leads with its message: a notice's tint or a compact state's line, not a button.
    if (
      doc.querySelector(
        ":is([data-notice-actions], [data-compact-actions]) :is(button, a)[data-variant]:not([data-variant='quiet'])",
      )
    ) {
      throw new Error("Keep Notice and compact StateMessage actions quiet; the message leads.");
    }

    // A page header offers one labelled action; further commands go in a "More actions" menu.
    for (const actions of doc.querySelectorAll("[data-page-actions]")) {
      if (actions.querySelectorAll(":is(button, a):not([data-icon-only])").length > 1) {
        throw new Error("Give a page header one labelled action and move the rest into a menu.");
      }
    }

    // Headers orient; a filled button there would outweigh the work it heads.
    if (
      doc.querySelector(
        ":is([data-page-actions], [data-header-actions]) :is(button, a):is([data-variant='primary'], [data-variant='destructive'])",
      )
    ) {
      throw new Error("Give page and section header actions the secondary or quiet variant.");
    }
  },
  parameters: {
    layout: "padded",
    controls: { expanded: true },
    a11y: { test: "error" },
  },
  decorators: [
    (Story, context) => (
      <Theme product={context.globals.theme === "product"}>
        <Story />
        <Toasts />
      </Theme>
    ),
  ],
};

export default preview;
