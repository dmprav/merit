import { execFileSync, spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn(), spawn: vi.fn() }));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  openSync: vi.fn(() => 3),
  writeFileSync: vi.fn(),
}));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));

const composeUp = [
  "docker",
  ["compose", "--file", "compose.yaml", "up", "-d", "--wait"],
  { cwd: new URL("../../", import.meta.url), stdio: "inherit" },
];

/** Fails `docker info` until it has been called `readyAfter` times. */
const dockerInfoReadyAfter = (readyAfter: number) => {
  let infoCalls = 0;
  vi.mocked(execFileSync).mockImplementation((command, args) => {
    if (command === "docker" && args?.[0] === "info") {
      infoCalls += 1;
      if (infoCalls < readyAfter) {
        throw new Error("Cannot connect to the Docker daemon");
      }
    }
    return Buffer.alloc(0);
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "getuid").mockReturnValue(0);
  vi.mocked(spawn).mockReturnValue({ unref: vi.fn() } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("starts the Compose services with an already running daemon", async () => {
  dockerInfoReadyAfter(1);

  await import("./start-services");

  expect(spawn).not.toHaveBeenCalled();
  expect(writeFileSync).not.toHaveBeenCalled();
  expect(vi.mocked(execFileSync).mock.calls.at(-1)).toEqual(composeUp);
});

it("starts the daemon with a registry mirror before starting the Compose services", async () => {
  dockerInfoReadyAfter(3);
  vi.mocked(existsSync).mockReturnValue(false);

  await import("./start-services");

  expect(writeFileSync).toHaveBeenCalledWith(
    "/etc/docker/daemon.json",
    '{"registry-mirrors":["https://mirror.gcr.io"]}\n',
  );
  expect(spawn).toHaveBeenCalledWith("dockerd", [], {
    detached: true,
    stdio: ["ignore", 3, 3],
  });
  expect(vi.mocked(execFileSync).mock.calls.at(-1)).toEqual(composeUp);
});

it("keeps an existing daemon configuration", async () => {
  dockerInfoReadyAfter(2);
  vi.mocked(existsSync).mockReturnValue(true);

  await import("./start-services");

  expect(writeFileSync).not.toHaveBeenCalled();
  expect(spawn).toHaveBeenCalledOnce();
});

it("asks for Docker instead of starting a daemon without root", async () => {
  dockerInfoReadyAfter(Infinity);
  vi.spyOn(process, "getuid").mockReturnValue(1000);

  await expect(import("./start-services")).rejects.toThrow("Start Docker");
  expect(spawn).not.toHaveBeenCalled();
  expect(execFileSync).not.toHaveBeenCalledWith(...composeUp);
});

it("reports a daemon that never becomes reachable", async () => {
  dockerInfoReadyAfter(Infinity);
  vi.mocked(existsSync).mockReturnValue(true);

  await expect(import("./start-services")).rejects.toThrow("did not start within 30s");
  expect(execFileSync).not.toHaveBeenCalledWith(...composeUp);
});
