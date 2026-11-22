import type { Actor } from "@merit/auth";

type DemoState =
  | {
      status: "ready";
      workspaceId: string;
      workspaceSlug: string;
      expiresAt: string;
      applicationRef?: string;
      roundRef?: string;
    }
  | { status: "expired" | "unavailable" | "limited" };

export interface DemoOperations {
  start: (actor: Actor, input: { fresh: boolean }) => Promise<DemoState>;
}
