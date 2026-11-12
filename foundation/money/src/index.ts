import { z } from "zod";

const currency = "EUR";
const maxMinorUnits = 10n ** 30n - 1n;

class MoneyValue {
  #value: bigint;

  constructor(minorUnits: bigint) {
    if (typeof minorUnits !== "bigint") {
      throw new TypeError("Minor units must be a bigint");
    }
    if (minorUnits < -maxMinorUnits || minorUnits > maxMinorUnits) {
      throw new RangeError("Money exceeds 30 minor-unit digits");
    }

    this.#value = minorUnits;
    Object.freeze(this);
  }

  static valueOf(this: void, money: MoneyValue): bigint {
    return money.#value;
  }

  toJSON(): never {
    throw new TypeError("Use encodeMoney to serialize monetary values");
  }
}

export type Money = MoneyValue;

const valueOf = MoneyValue.valueOf;

export const fromMinorUnits = (minorUnits: bigint): Money => new MoneyValue(minorUnits);

export const moneySchema = z.instanceof(MoneyValue);
export const moneyDataSchema = z.strictObject({
  minorUnits: z
    .string()
    .max(31)
    .regex(/^(?:0|-?[1-9]\d{0,29})$/),
  currency: z.literal(currency),
});

export type MoneyData = z.infer<typeof moneyDataSchema>;

export const encodeMoney = (money: Money): MoneyData => ({
  minorUnits: valueOf(money).toString(),
  currency,
});

export const decodeMoney = (input: unknown): Money => {
  const data = moneyDataSchema.parse(input);
  return fromMinorUnits(BigInt(data.minorUnits));
};

export const add = (left: Money, right: Money): Money => {
  return fromMinorUnits(valueOf(left) + valueOf(right));
};

export const subtract = (left: Money, right: Money): Money => {
  return fromMinorUnits(valueOf(left) - valueOf(right));
};

export const compare = (left: Money, right: Money): number => {
  const difference = valueOf(left) - valueOf(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

export const sum = (amounts: readonly Money[]): Money => amounts.reduce(add, fromMinorUnits(0n));

export const isNegative = (money: Money) => valueOf(money) < 0n;

export const isZero = (money: Money) => valueOf(money) === 0n;

export const absolute = (money: Money): Money =>
  isNegative(money) ? subtract(fromMinorUnits(0n), money) : money;

export const toDecimal = (money: Money): string => {
  const amount = valueOf(money);
  const magnitude = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, "0")}`;
};

export const parseMoney = (
  text: string,
):
  | { ok: true; value: Money }
  | { ok: false; error: "invalid_amount" | "excess_precision" | "amount_too_large" } => {
  if (text.length > 32) {
    return { ok: false, error: "amount_too_large" };
  }
  if (/^-?\d+\.\d{3,}$/.test(text)) {
    return { ok: false, error: "excess_precision" };
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) {
    return { ok: false, error: "invalid_amount" };
  }

  const [whole = "", fraction = ""] = text.replace(/^-/, "").split(".");
  const amount =
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) * (text.startsWith("-") ? -1n : 1n);
  if (amount < -maxMinorUnits || amount > maxMinorUnits) {
    return { ok: false, error: "amount_too_large" };
  }

  return { ok: true, value: fromMinorUnits(amount) };
};

export const formatMoney = (money: Money, locale: string): string => {
  const amount = valueOf(money);
  const fraction = (amount < 0n ? -amount : amount) % 100n;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fraction === 0n ? 0 : 2,
    maximumFractionDigits: 2,
  });
  // Bigint preserves the whole units; -0 retains the sign for balances between -1 and 0.
  const whole = amount / 100n;

  return formatter
    .formatToParts(whole === 0n && amount < 0n ? -0 : whole)
    .map((part) =>
      part.type === "fraction"
        ? new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }).format(
            fraction,
          )
        : part.value,
    )
    .join("");
};
