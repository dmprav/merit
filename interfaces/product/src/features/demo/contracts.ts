export type DemoState =
  | {
      status: "ready";
      workspaceSlug: string;
      expiresAt: string;
      applicationRef?: string;
      roundRef?: string;
    }
  | { status: "empty" | "expired" | "unavailable" | "limited" };

export interface DemoServices {
  read: () => Promise<DemoState>;
  start: (input: { fresh: boolean; resetWorkspaceId?: string }) => Promise<{
    state: DemoState;
    cookie?: { token: string; expiresAt: Date };
  }>;
}

export type StartDemo = (input: {
  fresh: boolean;
  resetWorkspaceId?: string;
}) => Promise<DemoState>;
