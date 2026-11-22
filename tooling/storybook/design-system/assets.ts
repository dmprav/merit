import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { LucideProps } from "lucide-react";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const uiSource = path.resolve(import.meta.dirname, "../../../foundation/ui/src");
const requireFromUi = createRequire(path.join(uiSource, "../package.json"));

/** Maps each Icon name to its Lucide module, as icon-base.tsx declares them. */
const iconModules = async () => {
  const source = await readFile(path.join(uiSource, "components/icon/icon-base.tsx"), "utf8");
  const imports = new Map(
    [...source.matchAll(/^import (\w+) from "lucide-react\/icons\/([\w-]+)";$/gm)].map(
      ([, binding = "", module = ""]) => [binding, module],
    ),
  );
  const table = /const icons = \{([\s\S]*?)\} as const;/.exec(source)?.[1] ?? "";
  const entries = [...table.matchAll(/^\s*([\w]+): (\w+),$/gm)].map(
    ([, name = "", binding = ""]) => {
      const module = imports.get(binding);
      if (module === undefined) {
        throw new Error(
          `Icon ${name} uses ${binding}, which icon-base.tsx does not import from lucide-react.`,
        );
      }
      return { name, module };
    },
  );
  if (entries.length === 0) {
    throw new Error("Found no icons in icon-base.tsx; update assets.ts to its current shape.");
  }
  return entries;
};

const isGlyphComponent = (value: unknown): value is ComponentType<LucideProps> =>
  typeof value === "function" || (typeof value === "object" && value !== null);

/**
 * Renders each Icon's Lucide glyph with IconBase's size, stroke and fill as a standalone SVG. The
 * stroke is baked in as `ink` because an <img> cannot inherit the surrounding text color.
 */
export const buildIcons = async (ink: string) =>
  Promise.all(
    (await iconModules()).map(async ({ name, module }) => {
      const url = pathToFileURL(requireFromUi.resolve(`lucide-react/dist/esm/icons/${module}.mjs`));
      const imported: unknown = await import(url.href);
      const Glyph =
        typeof imported === "object" && imported !== null && "default" in imported
          ? imported.default
          : undefined;
      if (!isGlyphComponent(Glyph)) {
        throw new Error(`Icon module ${module} did not export a default component.`);
      }
      const pinned = name === "pinned";
      const svg = renderToStaticMarkup(
        createElement(Glyph, {
          size: 16,
          color: ink,
          strokeWidth: pinned ? 1.25 : 1.75,
          fill: pinned ? ink : "none",
        }),
      );
      return { file: `${name}.svg`, svg: `${svg}\n` };
    }),
  );

/** Copies the mark's path from the Brand component, filled with `ink` (the action color). */
export const buildMark = async (ink: string) => {
  const source = await readFile(path.join(uiSource, "components/brand/brand.tsx"), "utf8");
  const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1];
  const d = /\sd="([^"]+)"/.exec(source)?.[1];
  if (viewBox === undefined || d === undefined) {
    throw new Error("Found no mark in brand.tsx; update assets.ts to its current shape.");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100" height="100"><path fill="${ink}" fill-rule="evenodd" d="${d}"/></svg>\n`;
};
