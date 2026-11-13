import type { z } from "zod";

import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";

import { teamInput, organizationIdInput, invitationTokenInput } from "../../api/identifiers";
import {
  teamPageInput,
  teamHistoryInput,
  invitationPageInput,
  teamEventInput,
  workspacePageInput,
  type Workspace,
} from "../../api/queries";
import { invitationProblem } from "../../domain/index";
import type { Dependencies } from "../dependencies";
import { createExecution } from "../execution";
import { hashToken } from "../invitation-token";
import { findInvitation } from "../persistence/invitations";
import { listAccessRequests } from "../persistence/queries/access-requests";
import * as persistence from "../persistence/queries/provisioning";
import { listWorkspaces } from "../persistence/queries/workspaces";
import { fail } from "../result";
import * as team from "./team";

export const createQueries = (
  dependencies: Pick<Dependencies, "database" | "isOperator" | "verifiedEmails">,
) => {
  const { run, canAdminister } = createExecution(dependencies);
  return {
    canAdminister,
    accessRequests: (actor: Actor) =>
      run(actor, true, () =>
        dependencies.database((db) => readTransaction(db, (tx) => listAccessRequests(tx))),
      ),

    list: async (actor: Actor) => {
      if (!canAdminister(actor)) {
        return { status: "forbidden" } as const;
      }
      return {
        status: "ok",
        value: await dependencies.database((db) =>
          readTransaction(db, (tx) => persistence.listOrganizations(tx)),
        ),
      } as const;
    },

    read: (actor: Actor, input: { organizationId: string }) =>
      run(actor, true, () => {
        const parsed = organizationIdInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }

        return dependencies.database((db) =>
          readTransaction(
            db,
            async (tx) =>
              (await persistence.readOrganization(tx, parsed.data.organizationId)) ??
              fail("not_found"),
          ),
        );
      }),

    invitation: (actor: Actor, input: { token: string }) =>
      run(actor, false, async () => {
        return readInvitation(dependencies, actor, input);
      }),

    workspacesPage: async (actor: Actor, input: z.input<typeof workspacePageInput>) => {
      const page = workspacePageInput.parse(input);
      const rows = await dependencies.database((db) =>
        readTransaction(db, (tx) => listWorkspaces(tx, actor.userId, undefined, page)),
      );
      const workspaces = rows.slice(0, page.limit);
      return {
        status: "ok" as const,
        value: workspaces,
        nextCursor: rows.length > page.limit ? workspaces.at(-1)!.id : null,
      };
    },

    ...createTeamQueries(dependencies),

    workspaces: async (actor: Actor) => ({
      status: "ok" as const,
      value: await dependencies.database((db) =>
        readTransaction(db, (tx) => listWorkspaces(tx, actor.userId)),
      ),
    }),
  };
};

export const getWorkspace = (
  db: Database,
  actor: Actor,
  slug?: string,
): Promise<Workspace | null> =>
  readTransaction(db, async (tx) => (await listWorkspaces(tx, actor.userId, slug))[0] ?? null);

const readInvitation = async (
  dependencies: Pick<Dependencies, "database" | "verifiedEmails">,
  actor: Actor,
  input: { token: string },
) => {
  const parsed = invitationTokenInput.safeParse(input);
  if (!parsed.success) {
    return fail("not_found");
  }

  const hash = await hashToken(parsed.data.token);
  const [record, emails] = await Promise.all([
    dependencies.database((db) =>
      readTransaction(db, async (tx) => (await findInvitation(tx, hash)) ?? fail("not_found")),
    ),
    dependencies.verifiedEmails(actor),
  ]);
  const problem = invitationProblem(record.invitation, emails, new Date());
  if (problem) {
    return fail(problem);
  }

  return {
    organization: record.organization,
    accepted: !!record.invitation.acceptedAt,
    administration: record.invitation.administration,
    role: record.invitation.role,
  };
};

const createTeamQueries = (dependencies: Pick<Dependencies, "database" | "isOperator">) => {
  const { run } = createExecution(dependencies);
  return {
    teamOverview: (actor: Actor, input: z.input<typeof teamInput>) =>
      run(actor, false, () =>
        dependencies.database((db) =>
          team.readTeamOverview(db, teamInput.parse(input).workspaceSlug, actor.userId),
        ),
      ),

    membersPage: (actor: Actor, input: z.input<typeof teamPageInput>) =>
      run(actor, false, () =>
        dependencies.database((db) =>
          team.readMemberPage(db, actor.userId, teamPageInput.parse(input)),
        ),
      ),

    invitationsPage: (actor: Actor, input: z.input<typeof invitationPageInput>) =>
      run(actor, false, () =>
        dependencies.database((db) =>
          team.readInvitationPage(db, actor.userId, invitationPageInput.parse(input)),
        ),
      ),

    teamHistoryPage: (actor: Actor, input: z.input<typeof teamHistoryInput>) =>
      run(actor, false, () =>
        dependencies.database((db) =>
          team.readHistoryPage(db, actor.userId, teamHistoryInput.parse(input)),
        ),
      ),

    teamEvent: (actor: Actor, input: z.input<typeof teamEventInput>) =>
      run(actor, false, () =>
        dependencies.database((db) =>
          team.readEventContent(db, actor.userId, teamEventInput.parse(input)),
        ),
      ),

    team: (actor: Actor, input: z.infer<typeof teamInput>) =>
      run(actor, false, async () => {
        const parsed = teamInput.safeParse(input);
        if (!parsed.success) {
          return fail("invalid_input");
        }
        return dependencies.database((db) =>
          team.readTeam(db, parsed.data.workspaceSlug, actor.userId),
        );
      }),
  };
};
