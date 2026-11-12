export type InvitationMessage = {
  id: string;
  to: string;
  organizationName: string;
  url: string;
  expiresAt: Date;
  administration: "none" | "administrator" | "owner";
  role: "member" | "program_manager";
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  kind: "standard" | "demo";
  demoExpiresAt: Date | null;
  demoSeedVersion: number | null;
};

export type AccessRequest = {
  email: string;
  requestedAt: Date;
  reviewedAt: Date | null;
  reviewedBy: string | null;
};
