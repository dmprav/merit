import { z } from "zod";

import type { FontFace } from "./fonts";

const familySchema = z.enum(["color", "spacing", "radius", "shadow", "size"]);

const metaSchema = z.object({
  themes: z.array(z.object({ id: z.string(), name: z.string(), selector: z.string() })).min(1),
  variables: z.record(
    z.string(),
    z.discriminatedUnion("family", [
      z.object({ family: familySchema, usage: z.string() }),
      z.object({ family: z.literal("type-family"), key: z.string() }),
      z.object({ family: z.literal("css"), reason: z.string() }),
    ]),
  ),
  extra: z.array(
    z.object({ family: familySchema, name: z.string(), value: z.string(), usage: z.string() }),
  ),
  type: z.object({
    families: z.record(z.string(), z.string()),
    groups: z.array(
      z.object({
        name: z.string(),
        family: z.string(),
        styles: z.array(z.looseObject({ name: z.string() })),
      }),
    ),
  }),
});

export type TokenMeta = z.infer<typeof metaSchema>;

export const parseTokenMeta = (json: unknown) => metaSchema.parse(json);

type Declarations = Map<string, string>;

/** Reads `--name: value` declarations per selector from a flat stylesheet such as tokens.css. */
const readCustomProperties = (css: string) => {
  const blocks = new Map<string, Declarations>();
  const source = css.replaceAll(/\/\*[\s\S]*?\*\//g, "");
  for (const [, selector = "", body = ""] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Declarations = blocks.get(selector.trim()) ?? new Map();
    for (const [, name = "", value = ""] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) {
      declarations.set(name, value.trim());
    }
    blocks.set(selector.trim(), declarations);
  }
  return blocks;
};

const referencePattern = /^var\(--([\w-]+)\)$/;

const colorValue = (value: string) => {
  const reference = referencePattern.exec(value);
  if (reference) {
    return `{${reference[1]}}`;
  }
  if (/^#[\da-f]{3,8}$/i.test(value) || /^(rgb|rgba|hsl|hsla|oklch)\([\d\s.,%/]+\)$/.test(value)) {
    return value.toLowerCase();
  }
  throw new Error(`Color ${value} cannot be a token; classify it as "css" in tokens.meta.json.`);
};

/** Resolves var() references through the base declarations, for lengths, shadows and type sizes. */
const literalValue = (value: string, base: Declarations, seen: string[] = []): string => {
  const reference = referencePattern.exec(value);
  if (!reference?.[1]) {
    return value;
  }
  const name = reference[1];
  const next = base.get(name);
  if (next === undefined || seen.includes(name)) {
    throw new Error(`Cannot resolve var(--${name}).`);
  }
  return literalValue(next, base, [...seen, name]);
};

/** Non-color families hold one value, so a theme override would be lost; such properties stay css-only. */
const sharedLength = (
  name: string,
  meta: TokenMeta,
  blocks: Map<string, Declarations>,
  base: Declarations,
) => {
  const value = literalValue(`var(--${name})`, base);
  for (const theme of meta.themes.slice(1)) {
    // A theme inherits the base declarations, so its aliases resolve against both.
    const themed = new Map([...base, ...(blocks.get(theme.selector) ?? [])]);
    if (literalValue(`var(--${name})`, themed) !== value) {
      throw new Error(
        `--${name} changes in the ${theme.id} theme; classify it as "css" in tokens.meta.json so the override is kept.`,
      );
    }
  }
  return value;
};

type Token = { name: string; value: string | Record<string, string>; usage: string };

const themeValues = (
  name: string,
  meta: TokenMeta,
  blocks: Map<string, Declarations>,
): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const theme of meta.themes) {
    const value = blocks.get(theme.selector)?.get(name);
    if (value !== undefined) {
      values[theme.id] = colorValue(value);
    }
  }
  return values;
};

const singleOrThemed = (values: Record<string, string>) => {
  const distinct = new Set(Object.values(values));
  const [only] = distinct;
  return distinct.size === 1 && only !== undefined ? only : values;
};

const resolveStyle = (style: Record<string, unknown>, base: Declarations) =>
  Object.fromEntries(
    Object.entries(style).map(([key, value]) => {
      if (typeof value !== "string" || !value.startsWith("--")) {
        return [key, value];
      }
      const resolved = literalValue(`var(${value})`, base);
      return [key, key === "lineHeight" && /^[\d.]+$/.test(resolved) ? Number(resolved) : resolved];
    }),
  );

/**
 * Builds the design system's tokens.json from tokens.css and its classification. Every custom
 * property in the base and theme blocks must be classified, so new tokens cannot be missed.
 */
export const buildTokens = (
  css: string,
  meta: TokenMeta,
  provenance: Record<string, unknown>,
  fonts: FontFace[] = [],
) => {
  const blocks = readCustomProperties(css);
  const [baseTheme] = meta.themes;
  const base = blocks.get(baseTheme?.selector ?? "") ?? new Map<string, string>();
  const declared = new Set(
    meta.themes.flatMap((theme) => [...(blocks.get(theme.selector)?.keys() ?? [])]),
  );
  const unclassified = [...declared].filter((name) => !(name in meta.variables));
  if (unclassified.length > 0) {
    throw new Error(
      `Classify ${unclassified.map((name) => `--${name}`).join(", ")} in tokens.meta.json.`,
    );
  }
  const stale = Object.keys(meta.variables).filter((name) => !declared.has(name));
  if (stale.length > 0) {
    throw new Error(
      `tokens.meta.json lists properties tokens.css no longer declares: ${stale.join(", ")}.`,
    );
  }

  const families: Record<z.infer<typeof familySchema>, Token[]> = {
    color: [],
    spacing: [],
    radius: [],
    shadow: [],
    size: [],
  };
  for (const name of declared) {
    const entry = meta.variables[name];
    if (entry?.family === "type-family" && meta.type.families[entry.key] !== `--${name}`) {
      throw new Error(
        `--${name} is classified as type family "${entry.key}", but tokens.meta.json type.families does not map "${entry.key}" to it.`,
      );
    }
    if (entry === undefined || entry.family === "css" || entry.family === "type-family") {
      continue;
    }
    if (!base.has(name)) {
      // The design system lends a later theme's value to the first theme, so a theme-only token would apply everywhere.
      throw new Error(
        `--${name} is declared only in a theme override; declare its base value in ${baseTheme?.selector ?? "the base theme"} or classify it as "css".`,
      );
    }
    const value =
      entry.family === "color"
        ? singleOrThemed(themeValues(name, meta, blocks))
        : sharedLength(name, meta, blocks, base);
    families[entry.family].push({ name, value, usage: entry.usage });
  }
  for (const { family, name, value, usage } of meta.extra) {
    families[family].push({ name, value, usage });
  }

  return {
    name: "Merit",
    version: 1,
    meta: provenance,
    color: { themes: meta.themes.map(({ id, name }) => ({ id, name })), tokens: families.color },
    type: {
      fonts,
      families: Object.fromEntries(
        Object.entries(meta.type.families).map(([key, variable]) => [
          key,
          literalValue(`var(${variable})`, base),
        ]),
      ),
      groups: meta.type.groups.map((group) => ({
        ...group,
        styles: group.styles.map((style) => resolveStyle(style, base)),
      })),
    },
    spacing: { tokens: families.spacing },
    radius: { tokens: families.radius },
    shadow: { tokens: families.shadow },
    size: { tokens: families.size },
  };
};

/**
 * The custom properties tokens.json cannot hold, for the top of bundle.css. Theme selectors map to
 * the design system's `data-theme` attribute.
 */
export const cssOnlyProperties = (css: string, meta: TokenMeta) => {
  const blocks = readCustomProperties(css);
  return meta.themes
    .map((theme, index) => {
      const declarations = [...(blocks.get(theme.selector) ?? [])].filter(
        ([name]) => meta.variables[name]?.family === "css",
      );
      if (declarations.length === 0) {
        return "";
      }
      const selector = index === 0 ? ":root" : `[data-theme="${theme.id}"]`;
      return `${selector} {\n${declarations.map(([name, value]) => `  --${name}: ${value};`).join("\n")}\n}\n`;
    })
    .join("");
};
