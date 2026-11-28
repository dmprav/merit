import { describe, expect, it } from "vite-plus/test";

import { baseSnapshot, baseStyle, outlinedSnapshot, pseudoBaseStyle } from "./snapshot.fixtures.ts";
import { compareStyleSnapshots, detectFocusVisualChange } from "./style-diff.ts";

const relative = (nodeId: number, style = baseStyle(), painted = true) => ({
  nodeId,
  style,
  painted,
});

const unchanged = { changed: false, reasons: [] };

describe("detectFocusVisualChange", () => {
  it("detects a visible outline", () => {
    expect(detectFocusVisualChange(baseSnapshot(), outlinedSnapshot())).toEqual({
      changed: true,
      reasons: ["self:outline"],
    });
  });

  it("detects a visible box-shadow", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot(),
        baseSnapshot({ self: baseStyle({ boxShadow: "rgb(15, 98, 254) 0px 0px 0px 2px" }) }),
      ),
    ).toEqual({ changed: true, reasons: ["self:box-shadow"] });
  });

  it("detects a change on an ancestor", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ ancestors: [relative(1)] }),
        baseSnapshot({
          ancestors: [relative(1, baseStyle({ backgroundColor: "rgb(238, 242, 255)" }))],
        }),
      ),
    ).toEqual({ changed: true, reasons: ["ancestor[0]:background"] });
  });

  it("detects a change on a descendant", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ descendants: [relative(1)] }),
        baseSnapshot({
          descendants: [relative(1, outlinedSnapshot().self)],
        }),
      ),
    ).toEqual({ changed: true, reasons: ["descendant[0]:outline"] });
  });

  it("ignores a replacement at the same index and follows a surviving descendant", () => {
    const before = baseSnapshot({ descendants: [relative(1), relative(2)] });
    const replacement = relative(3, outlinedSnapshot().self);
    expect(detectFocusVisualChange(before, baseSnapshot({ descendants: [replacement] }))).toEqual(
      unchanged,
    );
    expect(
      detectFocusVisualChange(
        before,
        baseSnapshot({
          descendants: [replacement, relative(1, outlinedSnapshot().self)],
        }),
      ),
    ).toEqual({ changed: true, reasons: ["descendant[1]:outline"] });
  });

  it("ignores changes confined to an unpainted relative", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ ancestors: [relative(1, baseStyle(), false)] }),
        baseSnapshot({ ancestors: [relative(1, outlinedSnapshot().self, false)] }),
      ),
    ).toEqual(unchanged);
  });

  it("ignores an outline confined to the hidden side of a visibility change", () => {
    const plain = relative(1, pseudoBaseStyle());
    const hiddenRing = relative(1, outlinedSnapshot().self, false);
    const visible = baseSnapshot({ descendants: [plain] });
    const hidden = baseSnapshot({ descendants: [hiddenRing] });
    expect(detectFocusVisualChange(visible, hidden)).toEqual(unchanged);
    expect(detectFocusVisualChange(hidden, visible)).toEqual(unchanged);
  });

  it("detects a pseudo-element that starts painting its background", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({
          after: pseudoBaseStyle({
            content: "none",
            opacity: "0",
            backgroundColor: "rgb(15, 98, 254)",
          }),
        }),
        baseSnapshot({
          after: pseudoBaseStyle({
            content: '""',
            opacity: "1",
            backgroundColor: "rgb(15, 98, 254)",
          }),
        }),
      ),
    ).toEqual({ changed: true, reasons: ["self::after:pseudo-indicator"] });
  });

  it("detects a pseudo-element border that fades in", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({
          before: pseudoBaseStyle({
            content: '""',
            opacity: "0",
            borderTopWidth: "2px",
            borderTopColor: "rgb(15, 98, 254)",
          }),
        }),
        baseSnapshot({
          before: pseudoBaseStyle({
            content: '""',
            opacity: "1",
            borderTopWidth: "2px",
            borderTopColor: "rgb(15, 98, 254)",
          }),
        }),
      ),
    ).toEqual({ changed: true, reasons: ["self::before:pseudo-indicator"] });
  });

  it("rejects a pseudo-element that gains content at opacity 0", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ after: pseudoBaseStyle({ content: "none", opacity: "0" }) }),
        baseSnapshot({ after: pseudoBaseStyle({ content: '""', opacity: "0" }) }),
      ),
    ).toEqual(unchanged);
  });

  it("rejects pseudo-element paint styles while it stays at opacity 0", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ after: pseudoBaseStyle({ content: "none", opacity: "1" }) }),
        baseSnapshot({
          after: pseudoBaseStyle({
            content: '""',
            opacity: "0",
            backgroundColor: "rgb(15, 98, 254)",
            boxShadow: "rgb(15, 98, 254) 0px 0px 0px 2px",
          }),
        }),
      ),
    ).toEqual(unchanged);
  });

  it("rejects a pseudo-element that gains empty content with nothing to paint", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ after: pseudoBaseStyle({ content: "none", opacity: "0" }) }),
        baseSnapshot({ after: pseudoBaseStyle({ content: '""', opacity: "1" }) }),
      ),
    ).toEqual(unchanged);
  });

  describe("borders", () => {
    const noBorder = {
      borderTopWidth: "0px",
      borderRightWidth: "0px",
      borderBottomWidth: "0px",
      borderLeftWidth: "0px",
    };

    it("ignores a color change on a zero-width border", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle(noBorder) }),
          baseSnapshot({ self: baseStyle({ ...noBorder, borderTopColor: "rgb(15, 98, 254)" }) }),
        ),
      ).toEqual(unchanged);
    });

    it("ignores a color change on a side that does not paint while another side does", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle({ ...noBorder, borderTopWidth: "2px" }) }),
          baseSnapshot({
            self: baseStyle({
              ...noBorder,
              borderTopWidth: "2px",
              borderLeftColor: "rgb(15, 98, 254)",
            }),
          }),
        ),
      ).toEqual(unchanged);
    });

    it("detects a color change on a painted side", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({ self: baseStyle({ borderTopColor: "rgb(15, 98, 254)" }) }),
        ),
      ).toEqual({ changed: true, reasons: ["self:border"] });
    });

    it("detects a side that starts painting", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle(noBorder) }),
          baseSnapshot({ self: baseStyle({ ...noBorder, borderBottomWidth: "2px" }) }),
        ),
      ).toEqual({ changed: true, reasons: ["self:border"] });
    });
  });

  describe("backgrounds", () => {
    const transparent = { backgroundColor: "rgba(0, 0, 0, 0)" };
    const image = { backgroundImage: "linear-gradient(red, blue)" };

    it("ignores a change between two transparent colors", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle(transparent) }),
          baseSnapshot({ self: baseStyle({ backgroundColor: "rgba(255, 0, 0, 0)" }) }),
        ),
      ).toEqual(unchanged);
    });

    it("ignores a transparent color change under an unchanged image", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle({ ...transparent, ...image }) }),
          baseSnapshot({ self: baseStyle({ ...image, backgroundColor: "transparent" }) }),
        ),
      ).toEqual(unchanged);
    });

    it("detects a color that starts painting", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle(transparent) }),
          baseSnapshot({ self: baseStyle({ backgroundColor: "rgb(15, 98, 254)" }) }),
        ),
      ).toEqual({ changed: true, reasons: ["self:background"] });
    });

    it("detects a color that stops painting", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle({ backgroundColor: "rgb(15, 98, 254)" }) }),
          baseSnapshot({ self: baseStyle(transparent) }),
        ),
      ).toEqual({ changed: true, reasons: ["self:background"] });
    });

    it("detects an image that starts painting", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle(transparent) }),
          baseSnapshot({ self: baseStyle({ ...transparent, ...image }) }),
        ),
      ).toEqual({ changed: true, reasons: ["self:background"] });
    });
  });

  describe("text decoration", () => {
    it("ignores a thickness change without a decoration line", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({ self: baseStyle({ textDecorationThickness: "3px" }) }),
        ),
      ).toEqual(unchanged);
    });

    it("detects a decoration line that appears", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({ self: baseStyle({ textDecorationLine: "underline" }) }),
        ),
      ).toEqual({ changed: true, reasons: ["self:text-decoration"] });
    });

    it("detects a thickness change on a painted decoration line", () => {
      expect(
        detectFocusVisualChange(
          baseSnapshot({ self: baseStyle({ textDecorationLine: "underline" }) }),
          baseSnapshot({
            self: baseStyle({ textDecorationLine: "underline", textDecorationThickness: "3px" }),
          }),
        ),
      ).toEqual({ changed: true, reasons: ["self:text-decoration"] });
    });
  });

  describe("outlines", () => {
    const outlined = (outlineColor: string, outlineWidth = "2px") =>
      baseSnapshot({ self: baseStyle({ outlineStyle: "solid", outlineWidth, outlineColor }) });

    it("rejects unchanged styles", () => {
      expect(detectFocusVisualChange(baseSnapshot(), baseSnapshot())).toEqual(unchanged);
    });

    it("rejects transparent outline colors, including CSS Color 4 slash-alpha and hsla", () => {
      for (const transparentColor of [
        "transparent",
        "rgba(0, 0, 0, 0)",
        "rgba(15, 98, 254, 0.0)",
        "hsla(210, 100%, 50%, 0)",
        "hsla(210, 100%, 50%, 0.0)",
        "hsla(210, 100%, 50%, 0%)",
        "rgb(0 0 0 / 0)",
        "oklch(0.5 0.1 200 / 0)",
        "oklch(0.5 0.1 200 / 0.0)",
        "color(srgb 0 0 0 / 0%)",
      ]) {
        expect(
          detectFocusVisualChange(baseSnapshot(), outlined(transparentColor)),
          `expected ${transparentColor} to be treated as transparent`,
        ).toEqual(unchanged);
      }
    });

    it("accepts translucent outline colors", () => {
      for (const visibleColor of [
        "rgb(0 0 0 / 0.5)",
        "oklch(0.5 0.1 200 / 0.5)",
        "color(srgb 0 0 0 / 50%)",
        "hsla(210, 100%, 50%, 0.5)",
      ]) {
        expect(
          detectFocusVisualChange(baseSnapshot(), outlined(visibleColor)),
          `expected ${visibleColor} to be detected as visible`,
        ).toEqual({ changed: true, reasons: ["self:outline"] });
      }
    });

    it("rejects a zero-width outline", () => {
      expect(detectFocusVisualChange(baseSnapshot(), outlined("rgb(0, 0, 0)", "0px"))).toEqual(
        unchanged,
      );
    });
  });

  describe("box shadows", () => {
    const shadowed = (boxShadow: string) => baseSnapshot({ self: baseStyle({ boxShadow }) });

    it("rejects shadows that paint nothing: transparent, or without offset, blur, or spread", () => {
      for (const transparentShadow of [
        "rgba(0, 0, 0, 0) 0px 0px 0px 2px",
        "rgb(0 0 0 / 0) 0 0 0 2px",
        "hsla(210, 100%, 50%, 0) 0px 0px 0px 2px",
        "0px 0px 0px 2px transparent",
        "rgba(0, 0, 0, 0) 0px 0px 0px 2px, rgb(0 0 0 / 0) 0px 0px 0px 4px",
        "rgb(255, 0, 0) 0px 0px 0px 0px",
        "rgb(255, 0, 0) 0px 0px 0px -2px",
        "rgb(255, 0, 0) 0px 0px 0px 0px inset",
        "rgb(255, 0, 0) 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 4px",
      ]) {
        expect(
          detectFocusVisualChange(baseSnapshot(), shadowed(transparentShadow)),
          `expected ${transparentShadow} to be rejected as transparent`,
        ).toEqual(unchanged);
      }
    });

    it("accepts opaque and translucent shadows with offset, blur, or spread", () => {
      for (const visibleShadow of [
        "rgb(15, 98, 254) 0px 0px 0px 2px",
        "rgba(15, 98, 254, 0.4) 0px 0px 0px 2px",
        "rgb(15 98 254 / 0.5) 0 0 0 2px",
        "rgba(0, 0, 0, 0) 0px 0px 0px 2px, rgb(15, 98, 254) 0px 0px 0px 4px",
        "rgb(15, 98, 254) 0px 2px 0px 0px",
        "rgb(15, 98, 254) 0px 0px 4px 0px",
        "rgb(15, 98, 254) 0px 0px 0px 2px inset",
      ]) {
        expect(
          detectFocusVisualChange(baseSnapshot(), shadowed(visibleShadow)),
          `expected ${visibleShadow} to be accepted as visible`,
        ).toEqual({ changed: true, reasons: ["self:box-shadow"] });
      }
    });

    it("rejects a change confined to a transparent layer beside an unchanged visible ring", () => {
      const ring = "rgb(15, 98, 254) 0px 0px 0px 2px";
      expect(
        detectFocusVisualChange(
          shadowed(`${ring}, rgba(0, 0, 0, 0) 0px 0px 0px 2px`),
          shadowed(`${ring}, rgba(0, 0, 0, 0) 0px 0px 0px 6px`),
        ),
      ).toEqual(unchanged);
    });

    it("accepts a visible ring added beside an unchanged one", () => {
      const ring = "rgb(15, 98, 254) 0px 0px 0px 2px";
      expect(
        detectFocusVisualChange(
          shadowed(ring),
          shadowed(`${ring}, rgb(255, 255, 255) 0px 0px 0px 4px`),
        ),
      ).toEqual({ changed: true, reasons: ["self:box-shadow"] });
    });
  });
});

describe("compareStyleSnapshots", () => {
  it("applies pseudo-element rules by the kind it is given, whatever the scope is named", () => {
    const unfocused = pseudoBaseStyle({ content: "none", opacity: "0" });
    const focused = pseudoBaseStyle({
      content: '""',
      opacity: "1",
      backgroundColor: "rgb(0, 0, 0)",
    });

    expect(compareStyleSnapshots(unfocused, focused, { scope: "marker", kind: "pseudo" })).toEqual([
      "marker:background",
      "marker:pseudo-indicator",
    ]);
    expect(compareStyleSnapshots(unfocused, focused, { scope: "marker", kind: "element" })).toEqual(
      ["marker:background"],
    );
  });
});
