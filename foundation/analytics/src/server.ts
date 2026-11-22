import { createHash, randomUUID } from "node:crypto";

import { defaultPostHogHost } from "./posthog-host";

export { defaultPostHogHost };

export type GrantOutcome = {
  event:
    | "round_created"
    | "application_recorded"
    | "assessment_submitted"
    | "funding_recommendation_saved";
  surface: "web" | "mcp";
  workspaceKind: "standard" | "demo";
  workspaceId: string;
};

export type ServerAnalytics = {
  captureGrantOutcome: (outcome: GrantOutcome) => void;
  captureMcpToolFinished: (toolName: string, outcome: string) => void;
};

export const createServerAnalytics = (config: {
  apiKey?: string;
  host?: string;
}): ServerAnalytics | undefined => {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    return undefined;
  }

  const host = config.host?.trim() || defaultPostHogHost;
  let inFlight = 0;

  const send = async (
    event: GrantOutcome["event"] | "mcp_tool_finished",
    properties: Record<string, string>,
  ) => {
    // Bound outstanding requests if ingestion is slow. Grant operations never wait for delivery.
    if (inFlight >= 50) {
      return;
    }
    inFlight++;
    try {
      const response = await fetch(new URL("i/v0/e/", host.replace(/\/?$/, "/")), {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          api_key: apiKey,
          event,
          distinct_id: randomUUID(),
          properties: { ...properties, $process_person_profile: false, $geoip_disable: true },
        }),
      });
      await response.body?.cancel();
    } catch {
      // Analytics delivery is best effort, including during a PostHog outage.
    } finally {
      inFlight--;
    }
  };

  return {
    captureGrantOutcome({ event, surface, workspaceKind, workspaceId }) {
      const properties: Record<string, string> = { surface, workspace_kind: workspaceKind };
      if (workspaceKind === "standard") {
        properties.workspace_key = createHash("sha256")
          .update("merit.workspace:")
          .update(workspaceId)
          .digest("hex");
      }
      void send(event, properties);
    },
    captureMcpToolFinished(toolName, outcome) {
      void send("mcp_tool_finished", { tool_name: toolName, outcome });
    },
  };
};
