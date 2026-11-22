import { readFileSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { buildTokens, cssOnlyProperties, parseTokenMeta, type TokenMeta } from "./tokens";

const tokensCss = readFileSync(
  new URL("../../../foundation/ui/src/foundations/tokens.css", import.meta.url),
  "utf8",
);
const tokenMeta = parseTokenMeta(
  JSON.parse(readFileSync(new URL("tokens.meta.json", import.meta.url), "utf8")),
);

const fixtureMeta = (variables: TokenMeta["variables"]): TokenMeta => ({
  themes: [
    { id: "site", name: "Site", selector: ":root" },
    { id: "product", name: "Product", selector: "[data-product-theme]" },
  ],
  variables,
  extra: [],
  type: { families: {}, groups: [] },
});

test("classifies every custom property tokens.css declares", () => {
  expect(() => buildTokens(tokensCss, tokenMeta, {})).not.toThrow();
});

test("rejects a custom property the classification does not list", () => {
  const css = ":root { --surface: #ffffff; --new-accent: #123456; }";
  const meta = fixtureMeta({ surface: { family: "color", usage: "Cards." } });

  expect(() => buildTokens(css, meta, {})).toThrow("Classify --new-accent");
});

test("reads a final declaration that has no semicolon", () => {
  const css = ":root { --surface: #ffffff; --new-accent: #123456 }";
  const meta = fixtureMeta({ surface: { family: "color", usage: "Cards." } });

  expect(() => buildTokens(css, meta, {})).toThrow("Classify --new-accent");
});

test("rejects a theme override of a family that holds one value", () => {
  const css = ":root { --space-1: 0.25rem; } [data-product-theme] { --space-1: 0.5rem; }";
  const meta = fixtureMeta({ "space-1": { family: "spacing", usage: "Tight gaps." } });

  expect(() => buildTokens(css, meta, {})).toThrow("--space-1 changes in the product theme");
});

test("resolves a theme's aliases against that theme before comparing", () => {
  const unchanged =
    ":root { --space-1: 0.25rem; --unit: 0.5rem; } [data-product-theme] { --unit: 0.25rem; --space-1: var(--unit); }";
  const inherited =
    ":root { --unit: 0.25rem; --space-1: var(--unit); } [data-product-theme] { --unit: 0.5rem; }";
  const meta = fixtureMeta({
    "space-1": { family: "spacing", usage: "Tight gaps." },
    unit: { family: "css", reason: "Base step." },
  });

  expect(buildTokens(unchanged, meta, {}).spacing.tokens).toEqual([
    { name: "space-1", value: "0.25rem", usage: "Tight gaps." },
  ]);
  expect(() => buildTokens(inherited, meta, {})).toThrow("--space-1 changes in the product theme");
});

test("rejects a token declared only in a theme override", () => {
  const css = ":root { --surface: #ffffff; } [data-product-theme] { --accent: #123456; }";
  const meta = fixtureMeta({
    surface: { family: "color", usage: "Cards." },
    accent: { family: "color", usage: "Highlights." },
  });

  expect(() => buildTokens(css, meta, {})).toThrow("--accent is declared only in a theme override");
});

test("rejects a font family classification type.families does not export", () => {
  const css = ":root { --font-mono: monospace; }";
  const meta = fixtureMeta({ "font-mono": { family: "type-family", key: "mono" } });

  expect(() => buildTokens(css, meta, {})).toThrow('does not map "mono"');
});

test("rejects a classification for a property tokens.css no longer declares", () => {
  const meta = fixtureMeta({
    surface: { family: "color", usage: "Cards." },
    retired: { family: "color", usage: "Gone." },
  });

  expect(() => buildTokens(":root { --surface: #ffffff; }", meta, {})).toThrow("retired");
});

test("keeps theme overrides per theme, aliases references, and collapses shared colors", () => {
  const css = `
    :root { --surface: #FFFFFF; --background: #f8f8f5; --focus: var(--surface); }
    [data-product-theme] { --background: #ffffff; }
  `;
  const meta = fixtureMeta({
    surface: { family: "color", usage: "Cards." },
    background: { family: "color", usage: "Page." },
    focus: { family: "color", usage: "Focus ring." },
  });

  expect(buildTokens(css, meta, {}).color.tokens).toEqual([
    { name: "surface", value: "#ffffff", usage: "Cards." },
    { name: "background", value: { site: "#f8f8f5", product: "#ffffff" }, usage: "Page." },
    { name: "focus", value: "{surface}", usage: "Focus ring." },
  ]);
});

test("refuses a color the design-system format cannot hold", () => {
  const css = ":root { --overlay: color-mix(in srgb, black 30%, transparent); }";
  const meta = fixtureMeta({ overlay: { family: "color", usage: "Modal backdrop." } });

  expect(() => buildTokens(css, meta, {})).toThrow('classify it as "css"');
});

test("resolves type sizes through the variables they reference", () => {
  const css = ":root { --text-body: 0.875rem; --text-control: var(--text-body); }";
  const meta: TokenMeta = {
    ...fixtureMeta({
      "text-body": { family: "css", reason: "Type step." },
      "text-control": { family: "css", reason: "Type step." },
    }),
    type: {
      families: {},
      groups: [
        { name: "Text", family: "sans", styles: [{ name: "control", fontSize: "--text-control" }] },
      ],
    },
  };

  expect(buildTokens(css, meta, {}).type.groups[0]?.styles).toEqual([
    { name: "control", fontSize: "0.875rem" },
  ]);
});

test("moves css-only theme overrides onto the design system's data-theme attribute", () => {
  const css = ":root { --text-body: 0.875rem; } [data-product-theme] { --text-body: 0.8125rem; }";
  const meta = fixtureMeta({ "text-body": { family: "css", reason: "Type step." } });

  expect(cssOnlyProperties(css, meta)).toBe(
    ':root {\n  --text-body: 0.875rem;\n}\n[data-theme="product"] {\n  --text-body: 0.8125rem;\n}\n',
  );
});
