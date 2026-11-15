import type { z } from "zod";

import type { Actor } from "@merit/auth";
import { readTransaction, type Database } from "@merit/db";
import { parseSearchTerms } from "@merit/db/search";
import { workspaceSlugSchema } from "@merit/organizations/api";

import {
  workspaceSearchInput,
  workspaceSearchLimits,
  workspaceSearchSchema,
  type MatchQuality,
} from "../../api/queries/workspace-search";
import { readGrantWorkspaceAccess } from "../persistence/queries/reading";
import { readWorkspaceSearch } from "../persistence/queries/workspace-search";

const qualities = ["exact", "prefix", "contains"] as const satisfies MatchQuality[];

/** Finds funding rounds and applications by name or applicant. Applicants and titles come from
 * each application's current recorded version, so drafts and superseded versions never match. */
export const searchWorkspace = (
  db: Database,
  actor: Actor,
  input: z.input<typeof workspaceSearchInput>,
) =>
  readTransaction(db, async (tx) => {
    const slug = workspaceSlugSchema.safeParse(input.workspaceSlug);
    if (!slug.success) {
      return { status: "not_found" } as const;
    }
    const access = await readGrantWorkspaceAccess(tx, actor.userId, slug.data);
    if (!access) {
      return { status: "not_found" } as const;
    }
    if (!access.allowed) {
      return { status: "forbidden" } as const;
    }

    const request = workspaceSearchInput.parse(input);
    const terms = parseSearchTerms(request.query);
    const found = terms
      ? await readWorkspaceSearch(tx, actor.userId, slug.data, terms, workspaceSearchLimits)
      : { rounds: [], applications: [] };

    const group = <Row extends { rank: 0 | 1 | 2; total: number }>(rows: Row[]) => ({
      total: rows[0]?.total ?? 0,
      results: rows.map(({ rank, total: _total, ...row }) => ({
        ...row,
        matchQuality: qualities[rank],
      })),
    });

    return workspaceSearchSchema.parse({
      status: "ok",
      rounds: group(found.rounds),
      applications: group(found.applications),
    });
  });
