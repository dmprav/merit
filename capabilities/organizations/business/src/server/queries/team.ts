import { z } from "zod";

import { permits } from "@merit/access";
import { readTransaction, type Database } from "@merit/db";

import type { Team } from "../../api/queries";
import * as persistence from "../persistence/queries/team";
import type { Transaction } from "../persistence/transaction";
import { fail } from "../result";

const workspace = async (tx: Transaction, slug: string, actor: string) => {
  const organization = (await persistence.readWorkspace(tx, slug)) ?? fail("not_found");
  const member = (await persistence.readSubject(tx, organization.id, actor)) ?? fail("forbidden");
  return { organization, member };
};

export const readTeam = (db: Database, slug: string, actor: string): Promise<Team> =>
  readTransaction(db, async (tx) => {
    const { organization, member } = await workspace(tx, slug, actor);
    const people = await persistence.readMembers(tx, organization.id);
    const invites = permits(member, "manage_members", member)
      ? await persistence.readPendingInvitations(tx, organization.id)
      : [];
    const history = permits(member, "manage_members", member)
      ? await persistence.readTeamHistory(tx, organization.id)
      : [];

    return {
      organization,
      subject: member,
      members: people,
      invitations: invites,
      history: history.map((entry) => ({
        ...entry,
        recordedAt: entry.recordedAt.toISOString(),
        details: z.json().parse(entry.details),
      })),
    };
  });

export const readTeamOverview = (db: Database, slug: string, actor: string) =>
  readTransaction(db, async (tx) => {
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
  readTransaction(db, async (tx) => {
    const { organization } = await workspace(tx, input.workspaceSlug, actor);
    const rows = await persistence.readMembers(tx, organization.id, input);
    const members = rows.slice(0, input.limit);
    return { members, nextCursor: rows.length > input.limit ? members.at(-1)!.membershipId : null };
  });

export const readInvitationPage = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number; issuedBy?: string },
) =>
  readTransaction(db, async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor);
    if (!permits(member, "manage_members", member)) {
      fail("forbidden");
    }
    const rows = await persistence.readPendingInvitations(tx, organization.id, input);
    const invitations = rows
      .slice(0, input.limit)
      .map((row) => ({ ...row, expiresAt: row.expiresAt.toISOString() }));
    return { invitations, nextCursor: rows.length > input.limit ? invitations.at(-1)!.id : null };
  });

export const readHistoryPage = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; after?: string; limit: number },
) =>
  readTransaction(db, async (tx) => {
    const { organization, member } = await workspace(tx, input.workspaceSlug, actor);
    if (!permits(member, "manage_members", member)) {
      fail("forbidden");
    }
    const rows = await persistence.readTeamHistoryPage(tx, organization.id, input);
    const entries = rows
      .slice(0, input.limit)
      .map((row) => ({ ...row, recordedAt: row.recordedAt.toISOString() }));
    return { entries, nextCursor: rows.length > input.limit ? entries.at(-1)!.eventId : null };
  });

export const readEventContent = (
  db: Database,
  actor: string,
  input: { workspaceSlug: string; eventId: string; offset: number; length: number },
) =>
  readTransaction(db, async (tx) => {
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
