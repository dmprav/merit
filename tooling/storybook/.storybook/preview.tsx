/// <reference types="vite/client" />
import type { Preview } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { STORY_FINISHED } from "storybook/internal/core-events";
import { addons } from "storybook/preview-api";
import { sb } from "storybook/test";

import "./styles.css";

sb.mock(
  "../../../interfaces/admin/src/features/organizations/data/server/organizations.functions.ts",
);
sb.mock(
  "../../../interfaces/admin/src/features/access-requests/data/server/access-requests.functions.ts",
);
sb.mock("../../../interfaces/product/src/features/navigation/data/server/navigation.functions.ts");
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
  "../../../interfaces/product/src/features/grantmaking/data/server/recommendations/recommendations.functions.ts",
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
  // Match the host's document-level theme so portals share the story's palette.
  useLayoutEffect(() => {
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

    const onFinished = ({ storyId, status }: { storyId: string; status: string }) => {
      if (storyId === id) {
        canvasElement.dataset.storyReady = status === "success" ? "true" : "error";
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
  parameters: {
    options: {
      storySort: {
        method: "alphabetical",
        order: [
          "Overview",
          "Foundations",
          ["Tokens", "Focus"],
          "Components",
          "Patterns",
          "Features",
          [
            "Funding rounds",
            ["List", "Create", "Overview", "Manage round", "Preparation form", "Workspace search"],
            "Applications",
            [
              "Create",
              "Overview",
              "Manage intake",
              "Intake form",
              "Manage reviews",
              "Reviewer participation",
              "Participate in review",
              "Recommendation",
              "Version history",
            ],
            "Team",
            ["Design guidance", "Manage team", "Members", "Invitations"],
            "Contacts",
            ["Directory", "Edit contact", "Contact picker"],
            "Workspace",
            ["Entry and recovery", "Request access", "Accept invitation"],
            "Administration",
            [
              "Access requests",
              "Organizations",
              "Create organization",
              "Organization details",
              "Owner invitation",
            ],
            "Demo",
          ],
        ],
      },
    },
    layout: "padded",
    controls: { expanded: true },
    a11y: { test: "error" },
  },
  decorators: [
    (Story, context) => (
      <Theme product={context.globals.theme === "product"}>
        <Story />
      </Theme>
    ),
  ],
};

export default preview;
