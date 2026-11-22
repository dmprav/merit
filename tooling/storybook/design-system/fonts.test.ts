import { expect, test } from "vite-plus/test";

import { readFontFaces } from "./fonts";

test("reads each @font-face rule into a design-system font entry", () => {
  const css = `
    /* instrument-sans-latin-wght-normal */
    @font-face {
      font-family: 'Instrument Sans Variable';
      font-style: normal;
      font-display: swap;
      font-weight: 400 700;
      src: url(./files/instrument-sans-latin-wght-normal.woff2) format('woff2-variations');
      unicode-range: U+0000-00FF,U+0131;
    }
  `;

  expect(readFontFaces(css)).toEqual([
    {
      source: "./files/instrument-sans-latin-wght-normal.woff2",
      face: {
        family: "Instrument Sans Variable",
        file: "fonts/instrument-sans-latin-wght-normal.woff2",
        weight: "400 700",
        style: "normal",
        unicodeRange: "U+0000-00FF, U+0131",
      },
    },
  ]);
});

test("rejects a rule it cannot place", () => {
  expect(() => readFontFaces("@font-face { font-family: 'X'; font-weight: 400; }")).toThrow(
    "lacks a family, source or weight",
  );
});
