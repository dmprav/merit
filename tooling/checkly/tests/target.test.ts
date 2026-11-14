import { expect, it } from "vite-plus/test";

import { resolveTargetBaseUrl } from "./target";

it("normalizes trailing slashes from a valid MERIT_BASE_URL", () => {
  expect(resolveTargetBaseUrl("https://merit.example/")).toBe("https://merit.example");
  expect(resolveTargetBaseUrl(" https://staging.merit.example/// ")).toBe(
    "https://staging.merit.example",
  );
  expect(resolveTargetBaseUrl("http://localhost:3000/")).toBe("http://localhost:3000");
});

it("rejects missing or non-http MERIT_BASE_URL values", () => {
  expect(() => resolveTargetBaseUrl(undefined)).toThrow(/MERIT_BASE_URL must be set/);
  expect(() => resolveTargetBaseUrl("   ")).toThrow(/MERIT_BASE_URL must be set/);
  expect(() => resolveTargetBaseUrl("ftp://merit.example")).toThrow(
    /MERIT_BASE_URL must be an http\(s\) URL/,
  );
  expect(() => resolveTargetBaseUrl("not-a-url")).toThrow(
    /MERIT_BASE_URL must be an http\(s\) URL/,
  );
});
