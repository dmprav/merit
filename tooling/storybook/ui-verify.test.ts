import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_STORYBOOK_TARGETS,
  allocateFreePort,
  buildContainerDelegationArgs,
  buildUniqueTargetStems,
  detectFocusVisualChange,
  filterStoryTargets,
  inferAppMode,
  parseCliArgs,
  runUiVerify,
  sanitizeTargetName,
  uiVerifyResultsSchema,
  type ElementStyleSnapshot,
  type FocusVisualSnapshot,
} from "./ui-verify.ts";

const baseStyle = (overrides: Partial<ElementStyleSnapshot> = {}): ElementStyleSnapshot => ({
  outlineStyle: "none",
  outlineWidth: "0px",
  outlineColor: "rgb(0, 0, 0)",
  outlineOffset: "0px",
  boxShadow: "none",
  borderTopColor: "rgb(200, 200, 200)",
  borderRightColor: "rgb(200, 200, 200)",
  borderBottomColor: "rgb(200, 200, 200)",
  borderLeftColor: "rgb(200, 200, 200)",
  borderTopWidth: "1px",
  borderRightWidth: "1px",
  borderBottomWidth: "1px",
  borderLeftWidth: "1px",
  backgroundColor: "rgb(255, 255, 255)",
  backgroundImage: "none",
  textDecorationLine: "none",
  textDecorationThickness: "auto",
  ...overrides,
});

const baseSnapshot = (overrides: Partial<FocusVisualSnapshot> = {}): FocusVisualSnapshot => ({
  self: baseStyle(),
  ancestors: [],
  descendants: [],
  ...overrides,
});

describe("parseCliArgs", () => {
  it("applies defaults when invoked with no arguments", () => {
    expect(parseCliArgs([])).toEqual({
      stories: [],
      routes: [],
      mode: undefined,
      viewport: "both",
      update: false,
      container: false,
      outDir: ".tmp/ui-verify",
      json: false,
      help: false,
    });
  });

  it("parses repeatable, comma-separated, equals-style flags and leading separator", () => {
    expect(
      parseCliArgs([
        "--",
        "--story",
        "button,dialog",
        "--story=text-field",
        "--route",
        "/demo,/app/alder/rounds",
        "--mode=workspace",
        "--viewport",
        "desktop",
        "--update",
        "--out",
        ".tmp/custom-verify",
        "--json",
      ]),
    ).toEqual({
      stories: ["button", "dialog", "text-field"],
      routes: ["/demo", "/app/alder/rounds"],
      mode: "workspace",
      viewport: "desktop",
      update: true,
      container: false,
      outDir: ".tmp/custom-verify",
      json: true,
      help: false,
    });
  });

  it("preserves commas inside /regex/ literals while splitting comma-separated --story patterns", () => {
    expect(parseCliArgs(["--story", "/^components-button.{1,30}$/"]).stories).toEqual([
      "/^components-button.{1,30}$/",
    ]);
    expect(parseCliArgs(["--story", "/^components-button.{1,30}$/i,dialog"]).stories).toEqual([
      "/^components-button.{1,30}$/i",
      "dialog",
    ]);
    expect(parseCliArgs(["--story", "button,/foo[,/]bar{1,2}/,text-field"]).stories).toEqual([
      "button",
      "/foo[,/]bar{1,2}/",
      "text-field",
    ]);
  });

  it("rejects invalid flags, modes, viewports, routes, and container+route combinations", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(/Unknown option/);
    expect(() => parseCliArgs(["--story"])).toThrow(/--story requires a value/);
    expect(() => parseCliArgs(["--mode", "prod"])).toThrow(/Invalid --mode/);
    expect(() => parseCliArgs(["--viewport", "tablet"])).toThrow(/Invalid --viewport/);
    expect(() => parseCliArgs(["--route", "demo"])).toThrow(/Routes must start with "\/"/);
    expect(() => parseCliArgs(["--route", "//evil.test/app"])).toThrow(
      /Protocol-relative routes are not allowed/,
    );
    expect(() => parseCliArgs(["--route", "/\\evil.test/app"])).toThrow(
      /Protocol-relative routes are not allowed/,
    );
    expect(() => parseCliArgs(["--route", "/app\nfoo"])).toThrow(/control characters/);
    expect(() => parseCliArgs(["--container", "--route", "/demo"])).toThrow(
      /--container delegates Storybook visual baselines/,
    );
  });
});

describe("inferAppMode", () => {
  it("infers workspace for /app and /admin routes (including query strings) and demo otherwise", () => {
    expect(inferAppMode(["/", "/demo", "/docs/rounds"])).toBe("demo");
    expect(inferAppMode(["/app"])).toBe("workspace");
    expect(inferAppMode(["/app/alder/rounds"])).toBe("workspace");
    expect(inferAppMode(["/admin/organizations"])).toBe("workspace");
    expect(inferAppMode(["/app?foo=1", "/admin?bar=2"])).toBe("workspace");
    expect(inferAppMode(["/app?foo=1"])).toBe("workspace");
    expect(inferAppMode(["/admin?bar=2"])).toBe("workspace");
    expect(inferAppMode(["/demo", "/app/alder/rounds"])).toBe("workspace");
    expect(inferAppMode(["/app/alder/rounds"], "demo")).toBe("demo");
    expect(inferAppMode(["/"], "workspace")).toBe("workspace");
  });
});

describe("filterStoryTargets and sanitizeTargetName", () => {
  const sampleIndex = [
    {
      id: "components-button--overview",
      title: "Components/Button",
      name: "Overview",
      type: "story",
    },
    { id: "components-button--docs", title: "Components/Button", name: "Docs", type: "docs" },
    {
      id: "patterns-form-dialog--with-context",
      title: "Patterns/Form dialog",
      name: "With context",
      type: "story",
    },
    {
      id: "features-merit-ai-conversation--default",
      title: "Features/Merit AI/Conversation",
      name: "Default",
      type: "story",
    },
  ];

  it("returns curated visual targets matching visual.spec.ts by default", () => {
    const targets = filterStoryTargets([], sampleIndex);
    expect(targets).toHaveLength(10);
    expect(targets.map((target) => target.name)).toEqual(
      DEFAULT_STORYBOOK_TARGETS.map((target) => target.name),
    );
    expect(
      targets.find((target) => target.id === "patterns-form-dialog--with-context")?.fullPage,
    ).toBe(false);
  });

  it("supports substring, glob, regex, and curated theme filters while ignoring docs entries", () => {
    expect(filterStoryTargets(["focus-site"], sampleIndex).map((t) => t.name)).toEqual([
      "focus-site",
    ]);
    expect(filterStoryTargets(["components-button*"], sampleIndex).map((t) => t.id)).toEqual([
      "components-button--overview",
    ]);
    expect(filterStoryTargets(["/merit-ai-conversation/"], sampleIndex).map((t) => t.id)).toEqual([
      "features-merit-ai-conversation--default",
    ]);
    expect(
      filterStoryTargets(["patterns-form-dialog--with-context"], sampleIndex)[0]?.fullPage,
    ).toBe(false);
  });

  it("sanitizes story and route target names deterministically and disambiguates collisions", () => {
    expect(sanitizeTargetName("/")).toBe("route-root");
    expect(sanitizeTargetName("/app/alder/rounds")).toBe("route-app-alder-rounds");
    expect(sanitizeTargetName("patterns-form-dialog--with-context")).toBe(
      "patterns-form-dialog--with-context",
    );

    expect(
      buildUniqueTargetStems(["components-button--overview", "patterns-form-dialog--with-context"]),
    ).toEqual(["components-button--overview", "patterns-form-dialog--with-context"]);

    const collided = buildUniqueTargetStems([
      "/app/alder/rounds",
      "/app/alder-rounds",
      "components-button--overview",
    ]);
    expect(collided[2]).toBe("components-button--overview");
    expect(collided[0]).toMatch(/^route-app-alder-rounds-[0-9a-f]{8}$/);
    expect(collided[1]).toMatch(/^route-app-alder-rounds-[0-9a-f]{8}$/);
    expect(collided[0]).not.toBe(collided[1]);
    expect(buildUniqueTargetStems(["/app/alder/rounds", "/app/alder-rounds"])).toEqual([
      collided[0],
      collided[1],
    ]);
  });
});

describe("detectFocusVisualChange", () => {
  it("detects visible outline, box-shadow, border, background, ancestor, descendant, and pseudo-element changes", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot(),
        baseSnapshot({
          self: baseStyle({
            outlineStyle: "solid",
            outlineWidth: "2px",
            outlineColor: "rgb(15, 98, 254)",
          }),
        }),
      ),
    ).toEqual({ changed: true, reasons: ["self:outline"] });

    expect(
      detectFocusVisualChange(
        baseSnapshot(),
        baseSnapshot({ self: baseStyle({ boxShadow: "rgb(15, 98, 254) 0px 0px 0px 2px" }) }),
      ),
    ).toEqual({ changed: true, reasons: ["self:box-shadow"] });

    expect(
      detectFocusVisualChange(
        baseSnapshot({ ancestors: [baseStyle()] }),
        baseSnapshot({ ancestors: [baseStyle({ backgroundColor: "rgb(238, 242, 255)" })] }),
      ),
    ).toEqual({ changed: true, reasons: ["ancestor[0]:background"] });

    expect(
      detectFocusVisualChange(
        baseSnapshot({ descendants: [baseStyle()] }),
        baseSnapshot({
          descendants: [
            baseStyle({ outlineStyle: "solid", outlineWidth: "2px", outlineColor: "rgb(0, 0, 0)" }),
          ],
        }),
      ),
    ).toEqual({ changed: true, reasons: ["descendant[0]:outline"] });

    expect(
      detectFocusVisualChange(
        baseSnapshot({ after: baseStyle({ content: "none", opacity: "0" }) }),
        baseSnapshot({ after: baseStyle({ content: '""', opacity: "1" }) }),
      ),
    ).toEqual({ changed: true, reasons: ["self::after:pseudo-indicator"] });
  });

  it("rejects unchanged styles and transparent or zero-width outlines (including CSS Color 4 slash-alpha and hsla)", () => {
    expect(detectFocusVisualChange(baseSnapshot(), baseSnapshot())).toEqual({
      changed: false,
      reasons: [],
    });

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
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({
            self: baseStyle({
              outlineStyle: "solid",
              outlineWidth: "2px",
              outlineColor: transparentColor,
            }),
          }),
        ),
        `expected ${transparentColor} to be treated as transparent`,
      ).toEqual({ changed: false, reasons: [] });
    }

    for (const visibleColor of [
      "rgb(0 0 0 / 0.5)",
      "oklch(0.5 0.1 200 / 0.5)",
      "color(srgb 0 0 0 / 50%)",
      "hsla(210, 100%, 50%, 0.5)",
    ]) {
      expect(
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({
            self: baseStyle({
              outlineStyle: "solid",
              outlineWidth: "2px",
              outlineColor: visibleColor,
            }),
          }),
        ),
        `expected ${visibleColor} to be detected as visible`,
      ).toEqual({ changed: true, reasons: ["self:outline"] });
    }

    expect(
      detectFocusVisualChange(
        baseSnapshot(),
        baseSnapshot({
          self: baseStyle({
            outlineStyle: "solid",
            outlineWidth: "0px",
            outlineColor: "rgb(0, 0, 0)",
          }),
        }),
      ),
    ).toEqual({ changed: false, reasons: [] });
  });

  it("rejects purely transparent box-shadow values while accepting opaque and translucent shadows", () => {
    for (const transparentShadow of [
      "rgba(0, 0, 0, 0) 0px 0px 0px 2px",
      "rgb(0 0 0 / 0) 0 0 0 2px",
      "hsla(210, 100%, 50%, 0) 0px 0px 0px 2px",
      "0px 0px 0px 2px transparent",
      "rgba(0, 0, 0, 0) 0px 0px 0px 2px, rgb(0 0 0 / 0) 0px 0px 0px 4px",
    ]) {
      expect(
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({ self: baseStyle({ boxShadow: transparentShadow }) }),
        ),
        `expected ${transparentShadow} to be rejected as transparent`,
      ).toEqual({ changed: false, reasons: [] });
    }

    for (const visibleShadow of [
      "rgb(15, 98, 254) 0px 0px 0px 2px",
      "rgba(15, 98, 254, 0.4) 0px 0px 0px 2px",
      "rgb(15 98 254 / 0.5) 0 0 0 2px",
      "rgba(0, 0, 0, 0) 0px 0px 0px 2px, rgb(15, 98, 254) 0px 0px 0px 4px",
    ]) {
      expect(
        detectFocusVisualChange(
          baseSnapshot(),
          baseSnapshot({ self: baseStyle({ boxShadow: visibleShadow }) }),
        ),
        `expected ${visibleShadow} to be accepted as visible`,
      ).toEqual({ changed: true, reasons: ["self:box-shadow"] });
    }
  });
});

describe("container delegation and proof reporting", () => {
  it("builds container delegation arguments forwarding update, viewport, and story filters", () => {
    expect(
      buildContainerDelegationArgs(
        parseCliArgs(["--container", "--update", "--viewport", "mobile", "--story", "button"]),
      ),
    ).toEqual(["--update-snapshots", "--project", "mobile", "--grep", "button"]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "focus-product"])),
    ).toEqual(["--grep", "control focus appearance in product"]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "focus-site"])),
    ).toEqual(["--grep", "control focus appearance in site"]);

    expect(
      buildContainerDelegationArgs(
        parseCliArgs(["--container", "--story", "design-language--focus-comparison"]),
      ),
    ).toEqual(["--grep", "control focus appearance in"]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "/Button/i"])),
    ).toEqual(["--grep", "/Button/i"]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "/Button/"])),
    ).toEqual(["--grep", "/Button/"]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "/Button/i,dialog"])),
    ).toEqual(["--grep", "/Button|dialog/i"]);

    expect(buildContainerDelegationArgs(parseCliArgs(["--container"]))).toEqual([]);
  });

  it("writes failed results.json and report.md when route validation fails inside runUiVerify", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-route-fail-"));
    const outDir = join(tempDir, "out");
    try {
      const results = await runUiVerify(
        {
          stories: [],
          routes: ["//evil.test/app"],
          mode: undefined,
          viewport: "desktop",
          update: false,
          container: false,
          outDir,
          json: false,
          help: false,
        },
        {
          repoRoot: tempDir,
          log: () => undefined,
        },
      );

      expect(results.passed).toBe(false);
      expect(results.error).toMatch(/Protocol-relative routes are not allowed/);

      const savedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
      );
      expect(savedJson.passed).toBe(false);
      expect(savedJson.error).toMatch(/Protocol-relative routes are not allowed/);

      const report = readFileSync(join(outDir, "report.md"), "utf8");
      expect(report).toContain("**Status:** FAIL");
      expect(report).toContain("## Error");
      expect(report).toContain("//evil.test/app");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes failed results.json and report.md when --story matches no stories", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-filter-fail-"));
    const outDir = join(tempDir, "out");
    const previousPrebuilt = process.env.MERIT_STORYBOOK_PREBUILT;
    try {
      mkdirSync(join(tempDir, "tooling/storybook/dist"), { recursive: true });
      writeFileSync(
        join(tempDir, "tooling/storybook/dist/index.json"),
        JSON.stringify({
          entries: {
            "components-button--overview": {
              id: "components-button--overview",
              title: "Components/Button",
              name: "Overview",
              type: "story",
            },
          },
        }),
        "utf8",
      );
      // Seed a stale passing report to confirm failure overwrites it.
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "results.json"), JSON.stringify({ passed: true }), "utf8");
      writeFileSync(join(outDir, "report.md"), "# Stale PASS\n", "utf8");

      process.env.MERIT_STORYBOOK_PREBUILT = "1";
      const results = await runUiVerify(
        parseCliArgs(["--story", "does-not-exist", "--out", outDir]),
        {
          repoRoot: tempDir,
          log: () => undefined,
        },
      );

      expect(results.passed).toBe(false);
      expect(results.error).toContain("does-not-exist");

      const savedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
      );
      expect(savedJson.passed).toBe(false);
      expect(savedJson.error).toContain("does-not-exist");

      const report = readFileSync(join(outDir, "report.md"), "utf8");
      expect(report).toContain("**Status:** FAIL");
      expect(report).toContain("## Error");
      expect(report).toContain("does-not-exist");
    } finally {
      if (previousPrebuilt === undefined) {
        delete process.env.MERIT_STORYBOOK_PREBUILT;
      } else {
        process.env.MERIT_STORYBOOK_PREBUILT = previousPrebuilt;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("delegates --container runs and writes Zod-validated results.json and report.md", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-container-"));
    try {
      const receivedArgs: string[][] = [];
      const results = await runUiVerify(
        parseCliArgs(["--container", "--update", "--out", tempDir]),
        {
          repoRoot: tempDir,
          runContainer: (args) => {
            receivedArgs.push([...args]);
            return 0;
          },
          log: () => undefined,
        },
      );

      expect(receivedArgs).toEqual([["--update-snapshots"]]);
      expect(results.passed).toBe(true);
      expect(results.mode).toBe("container");
      expect(results.updated).toBe(true);

      const parsedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(tempDir, "results.json"), "utf8")),
      );
      expect(parsedJson.containerExitCode).toBe(0);
      expect(readFileSync(join(tempDir, "report.md"), "utf8")).toContain("run-visual-container.ts");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("allocates a free ephemeral port", async () => {
    const port = await allocateFreePort();
    expect(port).toBeGreaterThan(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });
});
