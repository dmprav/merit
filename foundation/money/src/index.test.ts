import { describe, expect, it } from "vite-plus/test";

import {
  absolute,
  add,
  compare,
  decodeMoney,
  encodeMoney,
  formatMoney,
  fromMinorUnits,
  isNegative,
  isZero,
  parseMoney,
  subtract,
  sum,
  toDecimal,
} from "./index";

describe("exact money", () => {
  it.each([
    0n,
    1n,
    -1n,
    29n,
    -101n,
    9007199254740993n,
    999999999999999999999999999999n,
    -999999999999999999999999999999n,
  ])("round trips %s through text and JSON", (amount) => {
    const money = fromMinorUnits(amount);
    const parsed = parseMoney(toDecimal(money));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }
    expect(encodeMoney(parsed.value)).toEqual(encodeMoney(money));
    expect(encodeMoney(decodeMoney(JSON.parse(JSON.stringify(encodeMoney(money)))))).toEqual(
      encodeMoney(money),
    );
    expect(Object.isFrozen(money)).toBe(true);
    expect(() => JSON.stringify(money)).toThrow(/encodeMoney/);
  });

  it("adds and subtracts beyond safe numbers without mutating inputs", () => {
    const left = fromMinorUnits(9007199254740991n);
    const total = sum([left, fromMinorUnits(2n)]);

    expect(encodeMoney(total).minorUnits).toBe("9007199254740993");
    expect(compare(total, left)).toBe(1);
    expect(encodeMoney(subtract(left, total)).minorUnits).toBe("-2");
    expect(isNegative(subtract(left, total))).toBe(true);
    expect(toDecimal(absolute(subtract(left, total)))).toBe("0.02");
    expect(isZero(sum([]))).toBe(true);
    expect(encodeMoney(left).minorUnits).toBe("9007199254740991");
  });

  it.each([
    [-1n, true, false],
    [0n, false, true],
    [1n, false, false],
  ] as const)("classifies the sign and zero status of %s", (amount, negative, zero) => {
    const money = fromMinorUnits(amount);

    expect(isNegative(money)).toBe(negative);
    expect(isZero(money)).toBe(zero);
  });

  it.each([
    [-1n, 0n, -1],
    [9007199254740993n, 9007199254740993n, 0],
    [9007199254740993n, 9007199254740992n, 1],
  ] as const)("compares %s with %s exactly", (left, right, expected) => {
    expect(compare(fromMinorUnits(left), fromMinorUnits(right))).toBe(expected);
  });

  it("rejects values and arithmetic below the supported negative limit", () => {
    const minimum = fromMinorUnits(-999999999999999999999999999999n);

    expect(() => fromMinorUnits(-1000000000000000000000000000000n)).toThrow(RangeError);
    expect(() => subtract(minimum, fromMinorUnits(1n))).toThrow(RangeError);
    expect(encodeMoney(minimum).minorUnits).toBe("-999999999999999999999999999999");
  });

  it.each(["1.005", "1.000", "1e3", "NaN", "Infinity", "", " 1.00 ", "1,00"])(
    "rejects noncanonical or excess-precision text %s",
    (input) => {
      expect(parseMoney(input).ok).toBe(false);
    },
  );

  it.each(["01", "-0", "+1", "1.0", "1e3", "9".repeat(31)])(
    "rejects invalid wire amounts %s",
    (minorUnits) => {
      expect(() => decodeMoney({ minorUnits, currency: "EUR" })).toThrow();
    },
  );

  it("rejects unsupported currency, forged values and arithmetic beyond the supported range", () => {
    expect(() => decodeMoney({ minorUnits: "1", currency: "USD" })).toThrow();
    expect(() =>
      encodeMoney({ currency: "EUR" } as unknown as ReturnType<typeof fromMinorUnits>),
    ).toThrow();
    expect(() => add(fromMinorUnits(10n ** 30n - 1n), fromMinorUnits(1n))).toThrow(RangeError);
  });

  it("rejects numeric minor units instead of accepting potentially rounded values", () => {
    // @ts-expect-error JavaScript callers must also obey the exact bigint boundary.
    expect(() => fromMinorUnits(9007199254740992)).toThrow("Minor units must be a bigint");
  });

  it.each(["9".repeat(33), "1" + "0".repeat(28), "-1" + "0".repeat(28)])(
    "rejects amounts outside the supported range: %s",
    (amount) => {
      expect(parseMoney(amount)).toEqual({ ok: false, error: "amount_too_large" });
    },
  );

  it("preserves nonnegative amounts when taking their absolute value", () => {
    expect(toDecimal(absolute(fromMinorUnits(0n)))).toBe("0.00");
    expect(toDecimal(absolute(fromMinorUnits(125n)))).toBe("1.25");
  });

  it.each([
    [9007199254740991n, "en-IE", "€90,071,992,547,409.91"],
    [-1n, "en-IE", "-€0.01"],
    [-101n, "en-IE", "-€1.01"],
    [100n, "en-IE", "€1"],
    [123456n, "de-DE", "1.234,56 €"],
  ] as const)("formats %s exactly in %s", (amount, locale, expected) => {
    expect(formatMoney(fromMinorUnits(amount), locale)).toBe(expected);
  });
});
