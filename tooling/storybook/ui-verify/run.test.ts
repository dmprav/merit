import { describe, expect, it } from "vite-plus/test";

import { parseUiVerifyArgs } from "./cli.ts";
import { planReport, planRun } from "./run.ts";

const plan = (args: string[]) => {
  const options = parseUiVerifyArgs(args);
  return planRun(options, planReport(options, "/repo"));
};

describe("planReport", () => {
  it("checks the curated Storybook sweep without stories or routes", () => {
    expect(planReport(parseUiVerifyArgs([]), "/repo")).toEqual({
      mode: "storybook",
      outDir: "/repo/.tmp/ui-verify",
      updated: false,
    });
  });

  it("names a run by the targets it checks", () => {
    const modeFor = (args: string[]) => planReport(parseUiVerifyArgs(args), "/repo").mode;

    expect(modeFor(["--story", "button"])).toBe("storybook");
    expect(modeFor(["--route", "/demo"])).toBe("app");
    expect(modeFor(["--story", "button", "--route", "/demo"])).toBe("mixed");
    expect(modeFor(["--container"])).toBe("container");
  });

  it("resolves --out against the repository and records --update", () => {
    expect(planReport(parseUiVerifyArgs(["--out", "/abs/out", "--update"]), "/repo")).toMatchObject(
      { outDir: "/abs/out", updated: true },
    );
  });
});

describe("planRun", () => {
  it("plans the curated Storybook sweep at both viewports by default", () => {
    expect(plan([])).toEqual({
      kind: "host",
      update: false,
      screenshotsDir: "/repo/.tmp/ui-verify/screenshots",
      viewports: ["desktop", "mobile"],
      storybook: { filters: [] },
    });
  });

  it("plans routes on the app server mode they need, without Storybook", () => {
    expect(plan(["--route", "/demo,/app/alder/rounds", "--viewport", "mobile"])).toEqual({
      kind: "host",
      update: false,
      screenshotsDir: "/repo/.tmp/ui-verify/screenshots",
      viewports: ["mobile"],
      app: {
        mode: "workspace",
        targets: [
          { kind: "route", route: "/demo", name: "/demo", fullPage: true },
          { kind: "route", route: "/app/alder/rounds", name: "/app/alder/rounds", fullPage: true },
        ],
      },
    });
  });

  it("plans stories and routes together", () => {
    const mixed = plan(["--story", "button", "--route", "/demo", "--mode", "demo"]);
    expect(mixed).toMatchObject({ storybook: { filters: ["button"] }, app: { mode: "demo" } });
  });

  it("rejects routes the run cannot check", () => {
    const options = { ...parseUiVerifyArgs([]), routes: ["//evil.test/app"] };
    expect(() => planRun(options, planReport(options, "/repo"))).toThrow(
      /Protocol-relative routes are not allowed/,
    );
  });

  it("plans a container run with its Playwright arguments", () => {
    expect(plan(["--container", "--update", "--viewport", "desktop"])).toEqual({
      kind: "container",
      args: ["--update-snapshots", "--project", "desktop"],
    });
  });
});
