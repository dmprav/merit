import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "../../capabilities/*/business/src/persistence/*schema.ts",
    "../../capabilities/*/business/src/server/persistence/*schema.ts",
    "../auth/src/persistence/schema.ts",
  ],
  out: "./database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://merit:merit@127.0.0.1:55432/merit",
  },
});
