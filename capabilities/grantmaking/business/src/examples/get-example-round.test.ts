import { afterEach, expect, it, vi } from "vite-plus/test";

import { fromMinorUnits } from "@merit/money";

import { makeRound } from "../../tests/fixtures";
import type { FundingRoundOverview } from "../domain/model";
import { getExampleRound } from "./get-example-round";

const example = vi.hoisted(() => ({ read: vi.fn<() => FundingRoundOverview>() }));

// Supply invalid records without mutating the shared authored example.
vi.mock("./example-data", () => ({
  get exampleRound() {
    return example.read();
  },
}));

afterEach(() => vi.resetAllMocks());

it.each(["budget", "meetingDate"] as const)("rejects example data without a %s", (field) => {
  example.read.mockReturnValue(
    makeRound({ budget: fromMinorUnits(10000n), meetingDate: "2027-01-18", [field]: null }),
  );

  expect(getExampleRound).toThrow("The example round must have a budget and committee date");
});
