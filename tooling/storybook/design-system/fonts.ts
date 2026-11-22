import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const uiSource = path.resolve(import.meta.dirname, "../../../foundation/ui/src");
const requireFromUi = createRequire(path.join(uiSource, "../package.json"));

export type FontFace = {
  family: string;
  file: string;
  weight: string;
  style: string;
  unicodeRange?: string;
};

const descriptor = (block: string, name: string) =>
  new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim();

/**
 * Reads the @font-face rules of a font stylesheet into design-system font entries. Each file is
 * named by its basename under `fonts/`, with `source` the path relative to the stylesheet.
 */
export const readFontFaces = (css: string) =>
  [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, block = ""]) => {
    const family = descriptor(block, "font-family")?.replaceAll(/^['"]|['"]$/g, "");
    const source = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(block)?.[1];
    const weight = descriptor(block, "font-weight");
    if (family === undefined || source === undefined || weight === undefined) {
      throw new Error(`An @font-face rule lacks a family, source or weight:\n${block.trim()}`);
    }
    const unicodeRange = descriptor(block, "unicode-range")?.replaceAll(/\s*,\s*/g, ", ");
    return {
      source,
      face: {
        family,
        file: `fonts/${path.posix.basename(source)}`,
        weight,
        style: descriptor(block, "font-style") ?? "normal",
        ...(unicodeRange === undefined ? {} : { unicodeRange }),
      } satisfies FontFace,
    };
  });

/**
 * Finds the font stylesheets @merit/ui/styles.css imports from packages and returns their faces,
 * with each font file's absolute path to copy.
 */
export const collectFonts = async () => {
  const styles = await readFile(path.join(uiSource, "styles.css"), "utf8");
  const sheets = [...styles.matchAll(/@import\s+"(@[^"]+\.css)";/g)].map(([, sheet = ""]) => sheet);
  if (sheets.length === 0) {
    throw new Error("Found no package font stylesheet in @merit/ui/styles.css; update fonts.ts.");
  }
  const fonts = await Promise.all(
    sheets.map(async (sheet) => {
      const sheetPath = requireFromUi.resolve(sheet);
      const faces = readFontFaces(await readFile(sheetPath, "utf8"));
      if (faces.length === 0) {
        throw new Error(`${sheet} declares no @font-face rules.`);
      }
      return faces.map(({ source, face }) => ({
        face,
        path: path.resolve(path.dirname(sheetPath), source),
      }));
    }),
  );
  return fonts.flat();
};
