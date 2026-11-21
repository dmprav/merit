import { afterEach, expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";
import * as money from "@merit/money";

import { allocationTotalProblem } from "./index";

afterEach(() => vi.restoreAllMocks());

const maximum = fromMinorUnits(10n ** 30n - 1n);

it("accepts allocations whose total the money contract can represent", () => {
  expect(allocationTotalProblem([maximum, fromMinorUnits(0n)])).toBeNull();
});

it("rejects allocations whose total exceeds the money contract", () => {
  expect(allocationTotalProblem([maximum, fromMinorUnits(1n)])).toBe("allocation_total_too_large");
});

it("does not treat unexpected failures as an allocation limit", () => {
  const failure = new Error("unavailable");
  vi.spyOn(money, "sum").mockImplementation(() => {
    throw failure;
  });

  expect(() => allocationTotalProblem([maximum])).toThrow(failure);
});
