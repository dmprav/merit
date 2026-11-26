import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";
import remarkGfm from "remark-gfm";

const config: StorybookConfig = {
  stories: [
    "../../../foundation/ui/src/**/*.@(stories.tsx|mdx)",
    "../../../foundation/forms/src/**/*.@(stories.tsx|mdx)",
    "../../../foundation/tables/src/**/*.@(stories.tsx|mdx)",
    "../../../interfaces/product/src/features/**/*.@(stories.tsx|mdx)",
    "../../../capabilities/*/web/src/**/*.@(stories.tsx|mdx)",
    "../../../interfaces/admin/src/features/**/*.@(stories.tsx|mdx)",
  ],
  addons: [
    {
      name: "@storybook/addon-docs",
      options: { mdxPluginOptions: { mdxCompileOptions: { remarkPlugins: [remarkGfm] } } },
    },
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
  ],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: { viteConfigPath: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) },
    },
  },
  core: { disableTelemetry: true },
  // The browser suite runs against the build; keep React's development checks in it.
  features: { developmentModeForBuild: true },
  // Keep authored CSS values, as in development, for browser assertions on design tokens.
  viteFinal: (viteConfig) => ({ ...viteConfig, build: { ...viteConfig.build, cssMinify: false } }),
  storySorts: [
    {
      method: "alphabetical",
      order: [
        "Overview",
        "Design language",
        "Components",
        "Patterns",
        "Features",
        [
          "Funding rounds",
          ["List", "Create", "Overview", "Manage round"],
          "Applications",
          [
            "All applications",
            "Create",
            "Application detail",
            "Manage intake",
            "Intake form",
            "Withdraw and reinstate",
            "Manage reviews",
            "Manage reviewer invitations",
            "Review an assigned application",
            "Committee decision",
            "Recommendation",
            "Version history",
          ],
          "Activity",
          "Team",
          ["Design guidance", "Manage team"],
          "Contacts",
          ["Directory", "Edit contact", "Contact picker"],
          "Workspace",
          [
            "Entry and recovery",
            "Request access",
            "Accept invitation",
            "My work",
            "Search",
            "Pins",
          ],
          "Administration",
          [
            "Access requests",
            "Organizations",
            "Create organization",
            "Organization details",
            "Owner invitation",
          ],
          "Demo",
          ["Entry", "Guidance"],
          "Merit AI",
          ["Conversation"],
        ],
      ],
    },
  ],
};

export default config;
