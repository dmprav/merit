import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { VISUAL_TARGETS } from "../visual-targets.ts";
import { parseUiVerifyArgs } from "./cli.ts";
import {
  buildContainerDelegationArgs,
  buildUniqueTargetStems,
  filterStoryTargets,
  inferAppMode,
  sanitizeTargetName,
} from "./targets.ts";

type ListedSuite = { specs?: { title: string }[]; suites?: ListedSuite[] };

/** Titles of the tests tests/browser/visual.spec.ts registers, as Playwright itself lists them. */
const listVisualSpecTitles = (): string[] => {
  const storybookDir = fileURLToPath(new URL("..", import.meta.url));
  const vp = fileURLToPath(new URL("../../../node_modules/.bin/vp", import.meta.url));
  const report = JSON.parse(
    execFileSync(
      vp,
      [
        "exec",
        "playwright",
        "test",
        "--list",
        "--project",
        "desktop",
        "--reporter=json",
        "tests/browser/visual.spec.ts",
      ],
      { cwd: storybookDir, encoding: "utf8" },
    ),
  ) as { suites: ListedSuite[] };

  const titles = (suite: ListedSuite): string[] => [
    ...(suite.specs ?? []).map((spec) => spec.title),
    ...(suite.suites ?? []).flatMap(titles),
  ];

  return report.suites.flatMap(titles);
};

let listedVisualSpecTitles: string[] | undefined;

const visualSpecTitles = () => (listedVisualSpecTitles ??= listVisualSpecTitles());

describe("inferAppMode", () => {
  it("infers demo for routes outside /app and /admin", () => {
    expect(inferAppMode(["/", "/demo", "/docs/rounds"])).toBe("demo");
  });

  it("infers workspace for /app and /admin routes, including with query strings", () => {
    expect(inferAppMode(["/app"])).toBe("workspace");
    expect(inferAppMode(["/app/alder/rounds"])).toBe("workspace");
    expect(inferAppMode(["/admin/organizations"])).toBe("workspace");
    expect(inferAppMode(["/app?foo=1", "/admin?bar=2"])).toBe("workspace");
    expect(inferAppMode(["/app?foo=1"])).toBe("workspace");
    expect(inferAppMode(["/admin?bar=2"])).toBe("workspace");
  });

  it("infers workspace when any route needs it", () => {
    expect(inferAppMode(["/demo", "/app/alder/rounds"])).toBe("workspace");
  });

  it("keeps an explicit mode", () => {
    expect(inferAppMode(["/app/alder/rounds"], "demo")).toBe("demo");
    expect(inferAppMode(["/"], "workspace")).toBe("workspace");
  });
});

describe("filterStoryTargets", () => {
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

  it("returns the visual baseline stories by default", () => {
    const targets = filterStoryTargets([], sampleIndex);
    expect(targets.map((target) => target.name)).toEqual(
      VISUAL_TARGETS.map((target) => target.name),
    );
    expect(
      targets.find((target) => target.id === "patterns-form-dialog--with-context")?.fullPage,
    ).toBe(false);
  });

  it("checks by default exactly the stories visual.spec.ts captures", () => {
    expect(visualSpecTitles()).toEqual(VISUAL_TARGETS.map((target) => target.testTitle));
  });

  it("selects a curated theme target by its name", () => {
    expect(filterStoryTargets(["focus-site"], sampleIndex).map((t) => t.name)).toEqual([
      "focus-site",
    ]);
  });

  it("selects indexed stories by glob while ignoring docs entries", () => {
    expect(filterStoryTargets(["components-button*"], sampleIndex).map((t) => t.id)).toEqual([
      "components-button--overview",
    ]);
  });

  it("selects indexed stories by substring", () => {
    expect(filterStoryTargets(["merit-ai-conversation"], sampleIndex).map((t) => t.id)).toEqual([
      "features-merit-ai-conversation--default",
    ]);
  });

  it("captures only the viewport for a curated viewport-only story", () => {
    expect(
      filterStoryTargets(["patterns-form-dialog--with-context"], sampleIndex)[0]?.fullPage,
    ).toBe(false);
  });
});

describe("sanitizeTargetName", () => {
  it("names routes after their path and keeps story IDs", () => {
    expect(sanitizeTargetName("/")).toBe("route-root");
    expect(sanitizeTargetName("/app/alder/rounds")).toBe("route-app-alder-rounds");
    expect(sanitizeTargetName("patterns-form-dialog--with-context")).toBe(
      "patterns-form-dialog--with-context",
    );
  });
});

describe("buildUniqueTargetStems", () => {
  it("keeps story IDs as their stems", () => {
    expect(
      buildUniqueTargetStems(["components-button--overview", "patterns-form-dialog--with-context"]),
    ).toEqual(["components-button--overview", "patterns-form-dialog--with-context"]);
  });

  it("disambiguates routes whose sanitized names collide", () => {
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

  it("gives a target the same stem alone as in a batch, so a filtered --update leaves the other's file", () => {
    const [first, second] = buildUniqueTargetStems(["/app/alder/rounds", "/app/alder-rounds"]);
    expect(buildUniqueTargetStems(["/app/alder/rounds"])).toEqual([first]);
    expect(buildUniqueTargetStems(["/app/alder-rounds"])).toEqual([second]);
  });
});

describe("buildContainerDelegationArgs", () => {
  // Playwright matches a bare --grep case-insensitively against the project name, the file
  // name, and the test title joined with spaces.
  const containerSelection = (cliArgs: string[]) => {
    const args = buildContainerDelegationArgs(parseUiVerifyArgs(["--container", ...cliArgs]));
    const grepIndex = args.indexOf("--grep");
    const grep = grepIndex === -1 ? undefined : new RegExp(args[grepIndex + 1] ?? "", "i");
    return visualSpecTitles().filter((title) =>
      ["desktop", "mobile"].some(
        (project) => grep?.test(` ${project} visual.spec.ts ${title}`) ?? true,
      ),
    );
  };

  it("forwards --update and --viewport as Playwright arguments", () => {
    expect(
      buildContainerDelegationArgs(
        parseUiVerifyArgs(["--container", "--update", "--viewport", "mobile", "--story", "button"]),
      ).slice(0, 3),
    ).toEqual(["--update-snapshots", "--project", "mobile"]);
  });

  it("passes no arguments without filters", () => {
    expect(buildContainerDelegationArgs(parseUiVerifyArgs(["--container"]))).toEqual([]);
  });

  it("selects the visual tests a story filter matches", () => {
    expect(containerSelection(["--story", "button"])).toEqual([
      "appearance: components-button--overview",
    ]);
    expect(containerSelection(["--story", "components-button*,form-dialog"])).toEqual([
      "appearance: components-button--overview",
      "appearance: patterns-form-dialog--with-context",
    ]);
  });

  it("selects the focus appearance tests for curated focus aliases and their story", () => {
    expect(containerSelection(["--story", "focus-product"])).toEqual([
      "control focus appearance in product",
    ]);
    expect(containerSelection(["--story", "focus-site"])).toEqual([
      "control focus appearance in site",
    ]);
    expect(containerSelection(["--story", "design-language--focus-comparison"])).toEqual([
      "control focus appearance in product",
      "control focus appearance in site",
    ]);
  });

  it("rejects a container story filter that matches only Playwright project or file names", () => {
    for (const story of ["desktop", "mobile", "visual", "spec", "dialog.open", "constructor"]) {
      expect(
        () => buildContainerDelegationArgs(parseUiVerifyArgs(["--container", "--story", story])),
        story,
      ).toThrow(`--story "${story}" matches no visual baseline story`);
    }
  });

  it("anchors a glob filter so container mode selects only the visual tests the host glob selects", () => {
    expect(
      containerSelection(["--update", "--story", "patterns-application-shell--workspace-switche?"]),
    ).toEqual(["appearance: patterns-application-shell--workspace-switcher"]);
    expect(
      containerSelection(["--story", "patterns-application-shell--workspace-switcher"]),
    ).toEqual([
      "appearance: patterns-application-shell--workspace-switcher",
      "appearance: patterns-application-shell--workspace-switcher-long-name",
    ]);
  });

  it("maps substring and glob filters that select curated focus aliases to their container tests", () => {
    expect(containerSelection(["--story", "focus-*"])).toEqual([
      "control focus appearance in product",
      "control focus appearance in site",
    ]);
    expect(containerSelection(["--story", "focus-prod"])).toEqual([
      "control focus appearance in product",
    ]);
  });
});
