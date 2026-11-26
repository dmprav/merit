import { encodeMoney, parseMoney } from "@merit/money";

/** Read EUR amounts with their positions so a grader can check the associated claim. */
export const euroAmounts = (reply: string) => {
  const number = String.raw`-?\d+(?:[,.]\d+|[ \u00a0\u202f]\d{3}(?!\d))*`;
  const tokens = reply.matchAll(
    new RegExp(
      String.raw`(?:€|\bEUR)\s*(${number})|(${number})\s*(€|EUR\b|euros?\b|cents?\b)`,
      "gi",
    ),
  );
  return Array.from(tokens, (match) => {
    const value = (match[1] ?? match[2] ?? "")
      .replace(/[ \u00a0\u202f]/g, "")
      .replace(/,(?=\d{3}\b)/g, "")
      .replace(",", ".");
    const amount = parseMoney(value);
    const cents = /^cents?$/i.test(match[3] ?? "")
      ? value
      : amount.ok
        ? encodeMoney(amount.value).minorUnits
        : undefined;
    return { cents, start: match.index, end: match.index + match[0].length };
  });
};

/**
 * Every complete number in a reply as cents, with its sign, so "€24,502.50" is never read as
 * 2,450.25 and "€-2,450.25" is never read as a positive amount.
 */
export const numberAmounts = (reply: string) =>
  Array.from(
    reply.matchAll(
      /(?:(?<=^|[\s€(:])[-\u2212])?(?<![\d.,])\d+(?:[,.]\d+|[ \u00a0\u202f]\d{3}(?!\d))*/g,
    ),
    ([token]) => {
      const compact = token.replace(/[ \u00a0\u202f]/g, "").replace("\u2212", "-");
      const split = /^(.*)[,.](\d{1,2})$/.exec(compact);
      const value = split
        ? `${(split[1] ?? "").replace(/[,.]/g, "")}.${split[2]}`
        : compact.replace(/[,.]/g, "");
      const amount = parseMoney(value);
      return amount.ok ? encodeMoney(amount.value).minorUnits : undefined;
    },
  );
