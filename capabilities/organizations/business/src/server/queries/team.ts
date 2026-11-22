import { z } from "zod";

import { permits } from "@merit/access";
import { readAuditHistory } from "@merit/audit/server/read";
import type { Database, Transaction } from "@merit/db";

import type { Team } from "../../api/queries";
import * as persistence from "../persistence/queries/team";
import { readWorkspace } from "../persistence/tenant";
import { fail } from "../result";

const workspace = async (tx: Transaction, slug: string, actor: string) => {
  const organization = (await persistence.readWorkspace(tx, slug)) ?? fail("not_found");
  const member = (await persistence.readSubject(tx, organization.id, actor)) ?? fail("forbidden");
  if (!permits(member, "read_team", member)) {
    fail("forbidden");
  }
  return { organization, member };
};

export const readTeam = (db: Database, slug: string, actor: string): Promise<Team> =>
  readWorkspace(db, actor, slug, async (tx) => {
    const { organization, member } = await workspace(tx, slug, actor);
    const people = await persistence.readMembers(tx, organization.id);
    const invites = permits(member, "manage_members", member)
      ? await persistence.readPendingInvitations(tx, organization.id)
      : [];

    return {
      organization,
      subject: member,
      members: people,
      invitations: invites,
    };
  });

export const readTeamOverview = (db: Database, slug: string, actor: string) =>
  readWorkspace(db, actor, slug, async (tx) => {
    const { organization, member } = await workspace(tx, slug, actor);
    return {
      organization: { name: organization.name, slug: organization.slug, kind: organization.kind },
      subject: member,
      canManageMembers: permits(member, "manage_members", member),
    };
  });

export const readMemberPage = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number },
) =>
  readWorkspace(db, actor, input.workspaceSlug, async (tx) => {
    const { organization } = await workspace(tx, input.workspaceSlug, actor);
    const rows = await persistence.readMembers(tx, organization.id, input);
    const members = rows.slice(0, input.limit);
    const last = members.at(-1);
    return {
      members,
      nextCursor: rows.length > input.limit && last ? last.membershipId : null,
    };
  });

export const readInvitationPage = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number; issuedBy?: string },
) =>
  readWorkspace(db, actor, input.workspaceSlug, async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor);
    if (!permits(member, "manage_members", member)) {
      fail("forbidden");
    }
    const rows = await persistence.readPendingInvitations(tx, organization.id, input);
    const invitations = rows
      .slice(0, input.limit)
      .map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() }));
    const last = invitations.at(-1);
    return { invitations, nextCursor: rows.length > input.limit && last ? last.id : null };
  });

export const readHistoryPage = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number },
) =>
  readWorkspace(db, actor, input.workspaceSlug, async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor);
    if (!permits(member, "manage_members", member)) {
      fail("forbidden");
    }
    return teamHistory(tx, organization.id, input);
  });

export const readEventContent = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; eventId: string; offset: number; length: number },
) =>
  readWorkspace(db, actor, input.workspaceSlug, async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor);
    if (!permits(member, "manage_members", member)) {
      fail("forbidden");
    }
    const row = (await persistence.readTeamEvent(tx, organization.id, input)) ?? fail("not_found");
    if (input.offset > row.totalCharacters) {
      fail("invalid_input");
    }
    const end = Math.min(input.offset + input.length, row.totalCharacters);
    return {
      ...row,
      format: "json" as const,
      offset: input.offset,
      nextOffset: end < row.totalCharacters ? end : null,
    };
  });

const teamHistory = async (
  tx: Transaction,
  organizationId: string,
  page: { after?: string; limit: number },
) => {
  const result = await readAuditHistory(tx, {
    ...page,
    organizationId,
    targetTypes: ["organization", "team_invitation", "membership"],
  });
  return {
    ...result,
    entries: result.entries.map((entry) => ({
      eventId: entry.id,
      action: entry.action,
      actor: entry.actorName,
      provenance: entry.provenance,
      recordedAt: entry.recordedAt.toISOString(),
      details: z.json().parse(entry.details),
    })),
  };
};
