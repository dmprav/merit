import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { beforeEach, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import { AdminMessages } from "../../../app/messages";
import type { Organization } from "../contracts";
import { AdminDrafts } from "../controllers/drafts";
import {
  inviteAdministrator,
  readOrganization,
  renameOrganization,
  revokeInvitation,
} from "../data/server/organizations.functions";

export const organization: Organization = {
  id: "org-1",
  name: "Alder Foundation",
  slug: "alder",
  canOpenWorkspace: false,
  hasOwner: false,
  owner: null,
  invitation: {
    id: "invite-1",
    email: "first@example.test",
    delivery: "sent",
    createdAt: new Date("2026-11-01"),
    expiresAt: new Date("2099-11-08"),
    acceptedAt: null,
    revokedAt: null,
  },
};

export const Wrapper = ({ children, scope }: { children: ReactNode; scope?: string }) => {
  const [client] = useState(createQueryClient);

  return (
    <QueryClientProvider client={client}>
      <AdminMessages>
        <AdminDrafts scope={scope}>{children}</AdminDrafts>
      </AdminMessages>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readOrganization).mockResolvedValue({ status: "ok", value: organization });
  vi.mocked(inviteAdministrator).mockResolvedValue({ status: "ok", value: null });
  vi.mocked(renameOrganization).mockResolvedValue({ status: "ok", value: null });
  vi.mocked(revokeInvitation).mockResolvedValue({ status: "ok", value: null });
});
