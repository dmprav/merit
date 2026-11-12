import { sql } from "drizzle-orm";

import type { Database } from "@merit/db";

export const allocatePublicId = async (db: Database) => {
  const result = await db.execute<{ id: string }>(sql`SELECT merit_public_id() AS id`);
  return result.rows[0]!.id;
};
