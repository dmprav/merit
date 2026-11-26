import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads `.env.local` files in precedence order (first listed wins, while
 * never overriding variables already present in `process.env`).
 */
export const loadEnvLocalFiles = (paths: readonly string[]): void => {
  for (const envFile of paths) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
    }
  }
};

/**
 * Loads `<repoRoot>/.env.local` into `process.env` without overriding variables
 * already set in the environment. Defaults to the Merit repository root.
 */
export const loadRepoEnvLocal = (repoRoot: string = resolve(import.meta.dirname, "..")): void => {
  loadEnvLocalFiles([resolve(repoRoot, ".env.local")]);
};

export const readPort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port value: ${value}`);
  }
  return parsed;
};
