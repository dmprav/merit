import { and, or, eq, ne, inArray, sql, type SQLWrapper, type SQL } from "drizzle-orm";

import { policyFor, type Attributes, type AccessAction } from "../domain/policies";

/** Bind facts to columns or expressions. Bindings describe storage, never permission decisions. */
export const accessScope = (
  action: AccessAction,
  attributes: Partial<Record<keyof Attributes, SQLWrapper>>,
): SQL<boolean> => {
  const alternatives = policyFor(action).map((requirements) => {
    const conditions = requirements.map((requirement) => {
      const value = attributes[requirement.attribute];
      if (!value) {
        return sql`false`;
      }
      if ("values" in requirement) {
        return inArray(sql`${value}`, [...requirement.values]);
      }

      const other =
        attributes["equals" in requirement ? requirement.equals : requirement.differsFrom];
      if (!other) {
        return sql`false`;
      }

      return "equals" in requirement ? eq(sql`${value}`, other) : ne(sql`${value}`, other);
    });

    return and(...conditions) ?? sql`true`;
  });

  return sql<boolean>`coalesce(${or(...alternatives) ?? sql`false`}, false)`;
};
