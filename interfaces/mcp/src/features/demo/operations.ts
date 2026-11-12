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
  | { status: "empty" | "expired" | "unavailable" | "limited" };

export interface DemoOperations {
  read: (actor: Actor) => Promise<DemoState>;
  start: (actor: Actor, input: { fresh: boolean; resetWorkspaceId?: string }) => Promise<DemoState>;
}
