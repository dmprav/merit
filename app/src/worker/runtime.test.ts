import { afterEach, expect, it, vi } from "vite-plus/test";

import { createWorkerRuntime } from "./runtime";

afterEach(() => vi.unstubAllEnvs());

it.each([
  ["DATABASE_URL", "", "DATABASE_URL is required."],
  ["APP_ORIGIN", "invalid", "APP_ORIGIN must be the public HTTPS origin."],
])("validates %s from the worker environment", (name, value, message) => {
  vi.stubEnv("DATABASE_URL", "postgres://localhost/ambient");
  vi.stubEnv("APP_ORIGIN", "https://ambient.example");
  vi.stubEnv("MERIT_LOCAL_PREVIEW", undefined);
  expect(() =>
    createWorkerRuntime({
      MERIT_LOCAL_WORKER: "1",
      DATABASE_URL: "postgres://localhost/worker",
      APP_ORIGIN: "https://worker.example",
      [name]: value,
    }),
  ).toThrow(message);
});
