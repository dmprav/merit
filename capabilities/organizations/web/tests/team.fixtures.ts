import type { Team } from "@merit/organizations/api";

export const teamFixture: Team = {
  history: [],
  organization: {
    id: "alder",
    slug: "alder",
    name: "Alder Foundation",
    kind: "standard",
    demoExpiresAt: null,
    demoSeedVersion: null,
  },
  subject: {
    userId: "owner",
    organizationId: "alder",
    active: true,
    administration: "owner",
    role: "program_manager",
  },
  members: [
    {
      membershipId: "00000000-0000-4000-a000-000000000001",
      userId: "owner",
      organizationId: "alder",
      name: "Dana Reed",
      email: "dana@example.test",
      administration: "owner",
      role: "program_manager",
      active: true,
      version: 0,
    },
    {
      membershipId: "00000000-0000-4000-a000-000000000002",
      userId: "admin",
      organizationId: "alder",
      name: "Morgan Lee",
      email: "morgan@example.test",
      administration: "administrator",
      role: "member",
      active: true,
      version: 3,
    },
  ],
  invitations: [
    {
      id: "pending",
      email: "colleague@example.test",
      administration: "none",
      role: "program_manager",
      expiresAt: new Date("2099-01-01"),
      delivery: "failed",
      invitedBy: "admin",
    },
  ],
};
