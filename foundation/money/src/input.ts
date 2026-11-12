import { parseMoney, toDecimal, type Money } from "./index";

// Commas are decimal separators during editing. Grouped paste is accepted only with a decimal point.
export const moneyInput = (value: string): string | null => {
  let input = value.trim();
  if (/^\d{1,3}(?:,\d{3})+\.\d{0,2}$/.test(input)) {
    input = input.replaceAll(",", "");
  }
  if (input.length > 31 || !/^\d*(?:[.,]\d{0,2})?$/.test(input)) {
    return null;
  }

  return input.replace(",", ".");
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
