import { expect, it } from "vite-plus/test";

import { normalizeMoneyInput } from "./input";

it.each([
  ["28000", "28000.00"],
  [".50", "0.50"],
  [".", "."],
  ["9".repeat(31), "9".repeat(31)],
  ["9".repeat(32), "9".repeat(32)],
  ["28,000.50", "28000.50"],
  ["12000,50", "12000.50"],
  ["12.345", "12.345"],
  ["1.005", "1.005"],
  ["9.999", "9.999"],
  ["12.344", "12.344"],
  [" 12. ", "12.00"],
  ["90071992547409.91", "90071992547409.91"],
  ["90071992547409.915", "90071992547409.915"],
  ["", ""],
  ["12..34", "12..34"],
  ["-10", "-10"],
  ["1e3", "1e3"],
])("normalizes %s without floating-point rounding or hiding invalid input", (input, expected) => {
  expect(normalizeMoneyInput(input)).toBe(expected);
});
