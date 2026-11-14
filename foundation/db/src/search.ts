import { sql, type SQL } from "drizzle-orm";

/**
 * A typed search query: its words in order and the whole text they came from, with
 * whitespace collapsed. Matching is case- and accent-insensitive, so every comparison
 * folds both sides through `merit_search_normalize`.
 */
export type SearchTerms = { readonly whole: string; readonly words: readonly string[] };

/** The terms of a query, or null when it holds nothing to search for. */
export const parseSearchTerms = (query: string): SearchTerms | null => {
  const words = query.split(/\s+/).filter((word) => word !== "");
  return words.length === 0 ? null : { whole: words.join(" "), words };
};

/** Folds text for comparison; the indexes use the same expression. */
export const foldedText = (value: SQL | string) => sql<string>`merit_search_normalize(${value})`;

// `%`, `_` and `\` in typed text are ordinary characters, not LIKE wildcards.
const literal = (value: string) => value.replace(/[\\%_]/g, "\\$&");

/** Whether every word appears somewhere in `text`, in any order. */
export const containsEveryWord = (text: SQL, terms: SearchTerms) =>
  sql<boolean>`(${sql.join(
    terms.words.map((word) => sql`${foldedText(text)} like ${foldedText(`%${literal(word)}%`)}`),
    sql` and `,
  )})`;

/**
 * How closely the best of `fields` matches the whole query: 0 when a field equals it,
 * 1 when a field starts with it, 2 otherwise. Rows are expected to match already.
 */
export const matchRank = (fields: readonly SQL[], terms: SearchTerms) =>
  sql<0 | 1 | 2>`(case
    when ${sql.join(
      fields.map((field) => sql`${foldedText(field)} = ${foldedText(terms.whole)}`),
      sql` or `,
    )} then 0
    when ${sql.join(
      fields.map(
        (field) => sql`${foldedText(field)} like ${foldedText(`${literal(terms.whole)}%`)}`,
      ),
      sql` or `,
    )} then 1
    else 2 end)`;

/** Orders text the way people read it: case-insensitive, English. */
export const titleOrder = (field: SQL) => sql`lower(${field}) collate "en-x-icu"`;
