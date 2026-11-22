import { spawnSync } from "node:child_process";

import { expect, it } from "vite-plus/test";

const database = "postgres://db.example/merit";

it.each([
  { DATABASE_URL: undefined, APP_ORIGIN: "https://merit.example", missing: "DATABASE_URL" },
  { DATABASE_URL: database, APP_ORIGIN: undefined, missing: "APP_ORIGIN" },
  { DATABASE_URL: "", APP_ORIGIN: "https://merit.example", missing: "DATABASE_URL" },
  { DATABASE_URL: database, APP_ORIGIN: "", missing: "APP_ORIGIN" },
  { DATABASE_URL: database, APP_ORIGIN: "http://localhost:3000", missing: "APP_ORIGIN" },
  { DATABASE_URL: database, APP_ORIGIN: "https://example.com/path", missing: "APP_ORIGIN" },
])(
  "rejects invalid deployed configuration before serving ($missing, $APP_ORIGIN)",
  ({ missing, ...settings }) => {
    const run = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "await import('./dist/server/server.js')"],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, MERIT_LOCAL_PREVIEW: "", ...settings },
        encoding: "utf8",
      },
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(missing);
  },
);
