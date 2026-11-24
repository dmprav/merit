import { loadRepoEnvLocal, readPort } from "@merit/test-support/env";

loadRepoEnvLocal();

export const appPort = readPort(process.env.MERIT_APP_PORT, 3001);
export const appOrigin = `http://localhost:${appPort}`;

export const workspacePort = readPort(process.env.MERIT_WORKSPACE_PORT, 3002);
export const workspaceOrigin = `http://127.0.0.1:${workspacePort}`;
