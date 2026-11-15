import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vite-plus/test";

import { containsEveryWord, matchRank, parseSearchTerms } from "./search";

const dialect = new PgDialect();

it("splits a query into words and keeps the whole text with single spaces", () => {
  expect(parseSearchTerms("  harbour \t trust\n")).toEqual({
    whole: "harbour trust",
    words: ["harbour", "trust"],
  });
});

it.each(["", "   ", "\n\t"])("finds nothing to search for in %j", (query) => {
  expect(parseSearchTerms(query)).toBeNull();
});

it("binds typed text as parameters and treats wildcard characters as literals", () => {
  const terms = parseSearchTerms("50%_off \\ now")!;
  const query = dialect.sqlToQuery(containsEveryWord(sql`title`, terms));

  expect(query.sql).not.toContain("50");
  expect(query.params).toEqual(["%50\\%\\_off%", "%\\\\%", "%now%"]);
});

it("ranks exact before prefix before contains over every field", () => {
  const terms = parseSearchTerms("harbour")!;
  const query = dialect.sqlToQuery(matchRank([sql`title`, sql`applicant`], terms));

  expect(query.params).toEqual(["harbour", "harbour", "harbour%", "harbour%"]);
  expect(query.sql).toMatch(
    /case\s+when .* = .* or .* = .* then 0\s+when .* like .* or .* like .* then 1\s+else 2 end/s,
  );
});
