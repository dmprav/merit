import { z } from "zod";

import { parseMoney, toDecimal, type Money } from "./index";

/** Decimal text emitted by the editor, including unfinished entries such as "." and "12.". */
export const moneyInputTextSchema = z
  .string()
  .max(31)
  .regex(/^\d*(?:\.\d{0,2})?$/);

// Commas are decimal separators during editing. Grouped paste is accepted only with a decimal point.
export const moneyInput = (value: string): string | null => {
  let input = value.trim();
  if (/^\d{1,3}(?:,\d{3})+\.\d{0,2}$/.test(input)) {
    input = input.replaceAll(",", "");
  }
  const parsed = moneyInputTextSchema.safeParse(input.replace(",", "."));
  return parsed.success ? parsed.data : null;
};

export const parseMoneyInput = (value: string): Money | null => {
  const input = moneyInput(value);
  if (input === null || input === "" || input === ".") {
    return null;
  }

  const normalized = input.startsWith(".") ? `0${input}` : input;
  const parsed = parseMoney(normalized.endsWith(".") ? `${normalized}00` : normalized);
  return parsed.ok ? parsed.value : null;
};

export const normalizeMoneyInput = (value: string): string => {
  const parsed = parseMoneyInput(value);
  return parsed ? toDecimal(parsed) : value;
};
