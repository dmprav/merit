import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";

import { collectBrowserErrors, type BrowserError } from "@merit/test-support/browser";

import {
  DEFAULT_STORYBOOK_TARGETS,
  allocateFreePort,
  buildContainerDelegationArgs,
  detectFocusVisualChange,
  filterStoryTargets,
  formatMarkdownReport,
  inferAppMode,
  parseCliArgs,
  runUiVerify,
  sanitizeTargetName,
  summarizeResults,
  uiVerifyResultsSchema,
  verifyLoadedPage,
  writeProofArtifacts,
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
  color: "rgb(17, 17, 17)",
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

  it("rejects invalid flags, modes, viewports, routes, and container+route combinations", () => {
    expect(() => parseCliArgs(["--unknown"])).toThrow(/Unknown option/);
    expect(() => parseCliArgs(["--story"])).toThrow(/--story requires a value/);
    expect(() => parseCliArgs(["--mode", "prod"])).toThrow(/Invalid --mode/);
    expect(() => parseCliArgs(["--viewport", "tablet"])).toThrow(/Invalid --viewport/);
    expect(() => parseCliArgs(["--route", "demo"])).toThrow(/Routes must start with "\/"/);
    expect(() => parseCliArgs(["--container", "--route", "/demo"])).toThrow(
      /--container delegates Storybook visual baselines/,
    );
  });
});

describe("inferAppMode", () => {
  it("infers workspace for /app and /admin routes and demo otherwise", () => {
    expect(inferAppMode(["/", "/demo", "/docs/rounds"])).toBe("demo");
    expect(inferAppMode(["/app"])).toBe("workspace");
    expect(inferAppMode(["/app/alder/rounds"])).toBe("workspace");
    expect(inferAppMode(["/admin/organizations"])).toBe("workspace");
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

  it("sanitizes story and route target names deterministically", () => {
    expect(sanitizeTargetName("/")).toBe("route-root");
    expect(sanitizeTargetName("/app/alder/rounds")).toBe("route-app-alder-rounds");
    expect(sanitizeTargetName("patterns-form-dialog--with-context")).toBe(
      "patterns-form-dialog--with-context",
    );
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

  it("rejects unchanged styles and transparent or zero-width outlines", () => {
    expect(detectFocusVisualChange(baseSnapshot(), baseSnapshot())).toEqual({
      changed: false,
      reasons: [],
    });

    expect(
      detectFocusVisualChange(
        baseSnapshot(),
        baseSnapshot({
          self: baseStyle({
            outlineStyle: "solid",
            outlineWidth: "2px",
            outlineColor: "rgba(0, 0, 0, 0)",
          }),
        }),
      ),
    ).toEqual({ changed: false, reasons: [] });

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
});

describe("container delegation and proof reporting", () => {
  it("builds container delegation arguments forwarding update, viewport, and story filters", () => {
    expect(
      buildContainerDelegationArgs(
        parseCliArgs(["--container", "--update", "--viewport", "mobile", "--story", "button"]),
      ),
    ).toEqual(["--update-snapshots", "--project", "mobile", "--grep", "button"]);

    expect(buildContainerDelegationArgs(parseCliArgs(["--container"]))).toEqual([]);
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

describe("live Chromium checker failure detection", () => {
  let browser: Browser;
  let outDir: string;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    outDir = mkdtempSync(join(tmpdir(), "merit-ui-verify-browser-"));
  });

  afterAll(async () => {
    await browser.close();
    rmSync(outDir, { recursive: true, force: true });
  });

  const runFixture = async (name: string, html: string) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const errors: BrowserError[] = [];
    collectBrowserErrors(context, errors);
    try {
      const page = await context.newPage();
      await page.setContent(html);
      const screenshotPath = join(outDir, "screenshots", `${name}-desktop.png`);
      return await verifyLoadedPage({
        page,
        browserErrors: errors,
        kind: "story",
        target: name,
        name,
        url: `fixture://${name}`,
        viewport: "desktop",
        fullPage: true,
        screenshotPath,
      });
    } finally {
      await context.close();
    }
  };

  it("passes accessible pages with visible focus rings and pages with zero interactive stops", async () => {
    const accessible = await runFixture(
      "accessible-ok",
      `<!doctype html><html lang="en"><head><title>Accessible</title><style>
        body { background: #fff; color: #111; font-family: sans-serif; }
        button { padding: 8px 14px; background: #fff; color: #111; border: 1px solid #333; }
        button:focus-visible { outline: 2px solid #0f62fe; outline-offset: 2px; }
      </style></head><body><main><h1>Ready</h1><button type="button">Save</button></main></body></html>`,
    );
    expect(accessible.passed).toBe(true);
    expect(accessible.axeViolations).toEqual([]);
    expect(accessible.focus.stopsChecked).toBe(1);
    expect(accessible.focus.failures).toEqual([]);
    expect(accessible.screenshot && existsSync(accessible.screenshot)).toBe(true);

    const staticOnly = await runFixture(
      "static-zero-stops",
      `<!doctype html><html lang="en"><head><title>Notice</title><style>
        body { background: #fff; color: #111; }
      </style></head><body><main><h1>Static notice</h1><p>No controls here.</p></main></body></html>`,
    );
    expect(staticOnly.passed).toBe(true);
    expect(staticOnly.focus.stopsChecked).toBe(0);
    expect(staticOnly.focus.failures).toEqual([]);
  });

  it("catches an intentional axe WCAG violation and reports it in results.json and report.md", async () => {
    const badAxe = await runFixture(
      "intentional-axe-violation",
      `<!doctype html><html lang="en"><head><title>Broken a11y</title><style>
        body { background: #fff; color: #eee; }
        button { width: 40px; height: 28px; }
        button:focus-visible { outline: 2px solid #000; }
      </style></head><body><main><h1>Low contrast</h1><button type="button"></button></main></body></html>`,
    );

    expect(badAxe.passed).toBe(false);
    expect(badAxe.axeViolations.length).toBeGreaterThan(0);
    expect(
      badAxe.axeViolations.some((v) => v.id === "button-name" || v.id === "color-contrast"),
    ).toBe(true);

    const summary = summarizeResults({
      mode: "storybook",
      updated: false,
      outDir,
      targets: [badAxe],
    });
    expect(summary.passed).toBe(false);
    expect(summary.summary.axeViolations).toBeGreaterThan(0);

    writeProofArtifacts(outDir, summary);
    const savedJson = uiVerifyResultsSchema.parse(
      JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
    );
    expect(savedJson.passed).toBe(false);
    expect(savedJson.summary.axeViolations).toBeGreaterThan(0);

    const markdown = formatMarkdownReport(savedJson);
    expect(markdown).toContain("**Status:** FAIL");
    expect(markdown).toContain("intentional-axe-violation");
    expect(markdown).toContain("**Axe");
  });

  it("catches an intentional missing-focus-ring interactive element and reports it in results.json and report.md", async () => {
    const missingFocus = await runFixture(
      "intentional-missing-focus",
      `<!doctype html><html lang="en"><head><title>Missing focus</title><style>
        body { background: #fff; color: #111; }
        button {
          padding: 8px 14px;
          background: #fff;
          color: #111;
          border: 1px solid #333;
          outline: none;
          box-shadow: none;
        }
        button:focus, button:focus-visible {
          outline: none;
          box-shadow: none;
        }
      </style></head><body><main><h1>Focus bug</h1><button type="button">Invisible focus</button></main></body></html>`,
    );

    expect(missingFocus.passed).toBe(false);
    expect(missingFocus.axeViolations).toEqual([]);
    expect(missingFocus.focus.stopsChecked).toBe(1);
    expect(missingFocus.focus.failures).toHaveLength(1);
    expect(missingFocus.focus.failures[0]?.element).toContain("Invisible focus");

    const summary = summarizeResults({
      mode: "storybook",
      updated: false,
      outDir,
      targets: [missingFocus],
    });
    expect(summary.passed).toBe(false);
    expect(summary.summary.focusFailures).toBe(1);

    writeProofArtifacts(outDir, summary);
    const savedJson = uiVerifyResultsSchema.parse(
      JSON.parse(readFileSync(join(outDir, "results.json"), "utf8")),
    );
    expect(savedJson.passed).toBe(false);
    expect(savedJson.summary.focusFailures).toBe(1);

    const markdown = readFileSync(join(outDir, "report.md"), "utf8");
    expect(markdown).toContain("**Status:** FAIL");
    expect(markdown).toContain("Invisible focus");
    expect(markdown).toContain("no visible focus indicator");
  });

  it("catches horizontal overflow and console errors", async () => {
    const overflowing = await runFixture(
      "intentional-overflow-and-error",
      `<!doctype html><html lang="en"><head><title>Overflow</title><style>
        body { background: #fff; color: #111; }
        .wide { width: 3000px; height: 20px; }
      </style></head><body><main><h1>Overflow</h1><div class="wide">Too wide</div></main>
      <script>console.error("Synthetic runtime failure");</script></body></html>`,
    );

    expect(overflowing.passed).toBe(false);
    expect(overflowing.hasHorizontalOverflow).toBe(true);
    expect(overflowing.browserErrors).toEqual([
      expect.objectContaining({ type: "console", message: "Synthetic runtime failure" }),
    ]);
  });
});
