import { createContext } from "react";

export const WorkspaceNavigationContext = createContext<{
  workspaces: {
    id: string;
    name: string;
    slug: string;
    canWorkOnGrants: boolean;
    kind?: "standard" | "demo";
    demoExpiresAt?: string | null;
  }[];
  canAdminister: boolean;
  draftScope?: string;
}>({ workspaces: [], canAdminister: false });
