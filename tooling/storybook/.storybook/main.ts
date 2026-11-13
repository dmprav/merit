import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: [
    "../../../foundation/ui/src/**/*.@(stories.tsx|mdx)",
    "../../../foundation/forms/src/**/*.@(stories.tsx|mdx)",
    "../../../foundation/tables/src/**/*.@(stories.tsx|mdx)",
    "../../../interfaces/product/src/features/**/*.@(stories.tsx|mdx)",
    "../../../capabilities/*/web/src/**/*.@(stories.tsx|mdx)",
    "../../../interfaces/admin/src/features/**/*.@(stories.tsx|mdx)",
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {
      builder: { viteConfigPath: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) },
    },
  },
  core: { disableTelemetry: true },
  // The browser suite runs against the build; keep React's development checks in it.
  features: { developmentModeForBuild: true },
};

export default config;
