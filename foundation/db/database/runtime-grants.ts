import { readFile } from "node:fs/promises";

import type { Client } from "pg";

export const grantRuntimePrivileges = async (client: Client, role: string) => {
  const grants = await readFile(new URL("./runtime-grants.sql", import.meta.url), "utf8");
  await client.query(
    grants.replaceAll(':"runtime_role"', () => '"' + role.replaceAll('"', '""') + '"'),
  );
};
