import type { InvitationMessage } from "@merit/organizations/api";

const invitation: InvitationMessage = {
  id: "preview-invitation",
  to: "dana@example.test",
  organizationName: "Alder Foundation",
  url: `https://merit.example/invitations/${"a".repeat(64)}`,
  expiresAt: new Date("2026-11-16T12:00:00Z"),
  administration: "owner",
  role: "program_manager",
};

export const invitationFixtures = {
  owner: invitation,
  administrator: { ...invitation, administration: "administrator", role: "member" },
  reviewer: { ...invitation, administration: "none", role: "reviewer" },
  programManager: { ...invitation, administration: "none" },
  combined: { ...invitation, administration: "administrator" },
  longContent: {
    ...invitation,
    organizationName:
      "The Alder & Birch Foundation for Community Research, Learning and Long-Term Regional Development",
    to: "dana.reed.community.programmes@example.test",
  },
} satisfies Record<string, InvitationMessage>;
