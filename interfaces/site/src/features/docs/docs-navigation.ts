export const docsGroups = ["start", "work", "team", "integrations"] as const;

export const docsPages = {
  overview: { to: "/docs", group: "start" },
  quickstart: { to: "/docs/quickstart", group: "start" },
  workspaces: { to: "/docs/workspaces", group: "start" },
  rounds: { to: "/docs/rounds", group: "work" },
  applications: { to: "/docs/applications", group: "work" },
  contacts: { to: "/docs/contacts", group: "work" },
  reviews: { to: "/docs/reviews", group: "work" },
  recommendations: { to: "/docs/recommendations", group: "work" },
  team: { to: "/docs/team", group: "team" },
  mcp: { to: "/docs/mcp", group: "integrations" },
} as const satisfies Record<string, { to: string; group: (typeof docsGroups)[number] }>;

export type DocsPage = keyof typeof docsPages;
