import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_STORYBOOK_TARGETS,
  acquireOutputLock,
  acquireWithCleanup,
  allocateFreePort,
  buildContainerDelegationArgs,
  buildUniqueTargetStems,
  detectFocusVisualChange,
  filterStoryTargets,
  formatMarkdownReport,
  inferAppMode,
  parseCliArgs,
  runUiVerify,
  sanitizeTargetName,
  spawnManagedProcess,
  summarizeResults,
  uiVerifyResultsSchema,
  waitForHttpReady,
  type ElementStyleSnapshot,
  type FocusVisualSnapshot,
  type RegisterCleanup,
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

const pseudoBaseStyle = (overrides: Partial<ElementStyleSnapshot> = {}): ElementStyleSnapshot =>
  baseStyle({
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    borderTopColor: "rgba(0, 0, 0, 0)",
    borderRightColor: "rgba(0, 0, 0, 0)",
    borderBottomColor: "rgba(0, 0, 0, 0)",
    borderLeftColor: "rgba(0, 0, 0, 0)",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    content: "none",
    opacity: "1",
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

  it("splits comma-separated --story patterns and rejects /regex/ filters", () => {
    expect(parseCliArgs(["--story", "button, components-*,text-field"]).stories).toEqual([
      "button",
      "components-*",
      "text-field",
    ]);
    expect(() => parseCliArgs(["--story", "/Button/i"])).toThrow(
      /\/regex\/ filters are not supported/,
    );
    expect(() => parseCliArgs(["--story", "dialog,/^components-button/"])).toThrow(
      /Invalid --story "\/\^components-button\/"/,
    );
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
    expect(() => parseCliArgs(["--story", ","])).toThrow(/Invalid --story/);
    expect(() => parseCliArgs(["--story", " , "])).toThrow(/Invalid --story/);
    expect(() => parseCliArgs(["--story=,"])).toThrow(/Invalid --story/);
    expect(() => parseCliArgs(["--container", "--update", "--story", " , "])).toThrow(
      /Invalid --story/,
    );
    expect(() => parseCliArgs(["--route", " , "])).toThrow(/Invalid --route/);
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

  it("supports substring, glob, and curated theme filters while ignoring docs entries", () => {
    expect(filterStoryTargets(["focus-site"], sampleIndex).map((t) => t.name)).toEqual([
      "focus-site",
    ]);
    expect(filterStoryTargets(["components-button*"], sampleIndex).map((t) => t.id)).toEqual([
      "components-button--overview",
    ]);
    expect(filterStoryTargets(["merit-ai-conversation"], sampleIndex).map((t) => t.id)).toEqual([
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

  it("rejects invisible opacity:0 and unpainted content:'' pseudo-element focus changes", () => {
    expect(
      detectFocusVisualChange(
        baseSnapshot({ after: pseudoBaseStyle({ content: "none", opacity: "0" }) }),
        baseSnapshot({ after: pseudoBaseStyle({ content: '""', opacity: "0" }) }),
      ),
    ).toEqual({ changed: false, reasons: [] });

    expect(
      detectFocusVisualChange(
        baseSnapshot({
          after: pseudoBaseStyle({ content: "none", opacity: "1" }),
        }),
        baseSnapshot({
          after: pseudoBaseStyle({
            content: '""',
            opacity: "0",
            backgroundColor: "rgb(15, 98, 254)",
            boxShadow: "rgb(15, 98, 254) 0px 0px 0px 2px",
          }),
        }),
      ),
    ).toEqual({ changed: false, reasons: [] });

    expect(
      detectFocusVisualChange(
        baseSnapshot({ after: pseudoBaseStyle({ content: "none", opacity: "0" }) }),
        baseSnapshot({ after: pseudoBaseStyle({ content: '""', opacity: "1" }) }),
      ),
    ).toEqual({ changed: false, reasons: [] });
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
      // Opaque layers that paint nothing: no offset, no blur, and no positive spread.
      "rgb(255, 0, 0) 0px 0px 0px 0px",
      "rgb(255, 0, 0) 0px 0px 0px -2px",
      "rgb(255, 0, 0) 0px 0px 0px 0px inset",
      "rgb(255, 0, 0) 0px 0px, rgba(0, 0, 0, 0) 0px 0px 0px 4px",
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
      "rgb(15, 98, 254) 0px 2px 0px 0px",
      "rgb(15, 98, 254) 0px 0px 4px 0px",
      "rgb(15, 98, 254) 0px 0px 0px 2px inset",
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
      buildContainerDelegationArgs(
        parseCliArgs(["--container", "--story", "components-button*,dialog.open"]),
      ),
    ).toEqual(["--grep", "components-button.*|dialog\\.open"]);

    expect(buildContainerDelegationArgs(parseCliArgs(["--container"]))).toEqual([]);
  });

  it("maps substring and glob filters that select curated focus aliases to their container tests", () => {
    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "focus-*"])),
    ).toEqual([
      "--grep",
      "control focus appearance in product|control focus appearance in site|focus-.*",
    ]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "focus-prod"])),
    ).toEqual(["--grep", "control focus appearance in product|focus-prod"]);

    expect(
      buildContainerDelegationArgs(parseCliArgs(["--container", "--story", "constructor"])),
    ).toEqual(["--grep", "constructor"]);
  });

  it("escapes pipes in report target names while keeping the original name in results", () => {
    const results = summarizeResults({
      mode: "app",
      appMode: "demo",
      updated: false,
      outDir: "/tmp/out",
      generatedAt: "2026-01-01T00:00:00.000Z",
      targets: [
        {
          kind: "route",
          target: "/demo?q=a|b",
          name: "/demo?q=a|b",
          url: "http://127.0.0.1:1/demo?q=a|b",
          viewport: "desktop",
          passed: true,
          screenshot: "/tmp/out/screenshots/route-demo-q-a-b-desktop.png",
          viteErrorOverlayCount: 0,
          bodyVisible: true,
          dialogsVisible: true,
          enteringOrExitingCount: 0,
          scrollWidth: 100,
          innerWidth: 100,
          hasHorizontalOverflow: false,
          axeViolations: [],
          browserErrors: [],
          focus: { stopsChecked: 1, reachedCap: false, failures: [] },
        },
      ],
    });

    expect(results.targets[0]?.name).toBe("/demo?q=a|b");
    const row = formatMarkdownReport(results)
      .split("\n")
      .find((line) => line.startsWith("| `/demo"));
    expect(row).toBe(
      "| `/demo?q=a\\|b` | desktop | PASS | 0 | OK | 0 | OK (1) | `screenshots/route-demo-q-a-b-desktop.png` |",
    );
  });

  it("keeps other targets' screenshots and reports a failed --update cleanup instead of leaving a stale PASS", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-update-"));
    const outDir = join(tempDir, "out");
    const screenshotsDir = join(outDir, "screenshots");
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
      mkdirSync(screenshotsDir, { recursive: true });
      writeFileSync(join(outDir, "results.json"), JSON.stringify({ passed: true }), "utf8");
      writeFileSync(join(outDir, "report.md"), "# Stale PASS\n", "utf8");
      writeFileSync(join(screenshotsDir, "components-button--overview-mobile.png"), "mobile");
      writeFileSync(join(screenshotsDir, "other-story-desktop.png"), "other");
      // A directory where the selected screenshot belongs makes the cleanup fail.
      mkdirSync(join(screenshotsDir, "components-button--overview-desktop.png"));

      process.env.MERIT_STORYBOOK_PREBUILT = "1";
      const results = await runUiVerify(
        parseCliArgs([
          "--update",
          "--viewport",
          "desktop",
          "--story",
          "components-button--overview",
          "--out",
          outDir,
        ]),
        { repoRoot: tempDir, log: () => undefined },
      );

      expect(results.passed).toBe(false);
      expect(results.error).toContain("components-button--overview-desktop.png");
      const savedJson = uiVerifyResultsSchema.parse(
        JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
      );
      expect(savedJson.passed).toBe(false);
      expect(readFileSync(join(outDir, "report.md"), "utf8")).toContain("**Status:** FAIL");
      expect(existsSync(join(screenshotsDir, "components-button--overview-mobile.png"))).toBe(true);
      expect(existsSync(join(screenshotsDir, "other-story-desktop.png"))).toBe(true);
      expect(existsSync(join(outDir, ".ui-verify.lock"))).toBe(false);
    } finally {
      if (previousPrebuilt === undefined) {
        delete process.env.MERIT_STORYBOOK_PREBUILT;
      } else {
        process.env.MERIT_STORYBOOK_PREBUILT = previousPrebuilt;
      }
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("refuses an output directory another live run holds and takes over a stale lock", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-lock-"));
    try {
      const release = acquireOutputLock(tempDir);
      expect(() => acquireOutputLock(tempDir)).toThrow(/Another ui:verify run/);
      writeFileSync(join(tempDir, "results.json"), "other run", "utf8");
      await expect(
        runUiVerify(parseCliArgs(["--container", "--out", tempDir]), {
          repoRoot: tempDir,
          runContainer: () => 0,
          log: () => undefined,
        }),
      ).rejects.toThrow(/Another ui:verify run/);
      expect(readFileSync(join(tempDir, "results.json"), "utf8")).toBe("other run");
      release();
      expect(existsSync(join(tempDir, ".ui-verify.lock"))).toBe(false);

      // No process can have this pid, so the lock is stale.
      writeFileSync(join(tempDir, ".ui-verify.lock"), "2147483646\n", "utf8");
      const releaseStale = acquireOutputLock(tempDir);
      expect(readFileSync(join(tempDir, ".ui-verify.lock"), "utf8").trim()).toBe(
        String(process.pid),
      );
      releaseStale();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

describe("server startup and cleanup", () => {
  const listen = async (port: number): Promise<Server> => {
    const server = createServer((_request, response) => response.end("foreign"));
    await new Promise<void>((resolveListen) => server.listen(port, "127.0.0.1", resolveListen));
    return server;
  };

  it("does not accept a foreign listener on the allocated port as the started server", async () => {
    const port = await allocateFreePort();
    const foreign = await listen(port);
    const url = `http://127.0.0.1:${port}`;
    // Simulates `--strictPort` failing because the port was taken after allocation.
    const managed = spawnManagedProcess(
      process.execPath,
      ["-e", "setTimeout(() => process.exit(1), 300)"],
      { cwd: process.cwd(), announcedUrl: `${url}/` },
    );
    try {
      await expect(waitForHttpReady(url, 5_000, managed)).rejects.toThrow(/exited early/);
    } finally {
      managed.child.kill();
      await new Promise((resolveClose) => foreign.close(resolveClose));
    }
  });

  it("accepts the started server once it announces its URL and responds", async () => {
    const port = await allocateFreePort();
    const url = `http://127.0.0.1:${port}`;
    const script = `require("node:http").createServer((q, r) => r.end("ok")).listen(${port}, "127.0.0.1", () => console.log("  Local:   ${url}/"));`;
    const managed = spawnManagedProcess(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      announcedUrl: `${url}/`,
    });
    try {
      await waitForHttpReady(url, 10_000, managed);
      expect(managed.hasAnnouncedUrl()).toBe(true);
    } finally {
      managed.child.kill();
    }
  });

  it("reports a server that cannot be spawned instead of crashing", async () => {
    const managed = spawnManagedProcess("merit-ui-verify-missing-command", [], {
      cwd: process.cwd(),
      announcedUrl: "http://127.0.0.1:1/",
    });
    await expect(waitForHttpReady("http://127.0.0.1:1", 5_000, managed)).rejects.toThrow(
      /failed to start/,
    );
  });

  it("releases a resource acquired while cleanup was already draining and stops startup", async () => {
    const cleanups: Array<() => Promise<void>> = [];

    const registerCleanup: RegisterCleanup = (cleanup) => {
      cleanups.push(cleanup);
      return cleanup;
    };

    const released: string[] = [];

    let finishAcquisition: (value: string) => void = () => undefined;

    const acquisition = new Promise<string>((resolveAcquisition) => {
      finishAcquisition = resolveAcquisition;
    });

    const startup = acquireWithCleanup(
      acquisition,
      async (resource) => {
        released.push(resource);
      },
      registerCleanup,
    );
    // A signal drains the cleanup stack before the database exists.
    const draining = Promise.all(cleanups.map((cleanup) => cleanup()));
    finishAcquisition("test_db");

    await expect(startup).rejects.toThrow(/Cleanup started/);
    await draining;
    expect(released).toEqual(["test_db"]);
  });

  it("returns an acquired resource whose release runs once through the cleanup stack", async () => {
    const cleanups: Array<() => Promise<void>> = [];

    const registerCleanup: RegisterCleanup = (cleanup) => {
      let pending: Promise<void> | undefined;

      const idempotent = () => {
        pending ??= cleanup();
        return pending;
      };

      cleanups.push(idempotent);
      return idempotent;
    };

    const released: string[] = [];

    const { resource, release } = await acquireWithCleanup(
      Promise.resolve("test_db"),
      async (value) => {
        released.push(value);
      },
      registerCleanup,
    );
    expect(resource).toBe("test_db");
    await release();
    await Promise.all(cleanups.map((cleanup) => cleanup()));
    expect(released).toEqual(["test_db"]);
  });
});
