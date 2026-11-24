import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnvFile = resolve(import.meta.dirname, "../../..", ".env.local");

export const loadRepoEnvLocal = (): void => {
  if (existsSync(rootEnvFile)) {
    process.loadEnvFile(rootEnvFile);
  }
};

const readPort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port value: ${value}`);
  }
  return parsed;
};

loadRepoEnvLocal();

export const appPort = readPort(process.env.MERIT_APP_PORT, 3001);
export const appOrigin = `http://localhost:${appPort}`;

export const workspacePort = readPort(process.env.MERIT_WORKSPACE_PORT, 3002);
export const workspaceOrigin = `http://127.0.0.1:${workspacePort}`;
