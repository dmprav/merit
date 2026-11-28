import { expectTypeOf, it } from "vite-plus/test";

import type { Transaction } from "@merit/db";
import type { LockedWorkspace } from "@merit/organizations/locks";
import type {
  LockedFundingRound,
  lockFundingRound,
  lockPreparationRoundAccess,
} from "@merit/rounds/locks";

import type {
  lockCaseRow,
  LockedApplicationCase,
  readCaseWithdrawn,
} from "../src/server/persistence/commands/locks";

it("requires the locked parent for each resource and the locked case for withdrawal", () => {
  type WorkspaceStep = Parameters<typeof lockFundingRound>[0];

  type RoundStep = Parameters<typeof lockCaseRow>[0];

  type CaseRead = Parameters<typeof readCaseWithdrawn>[0];

  type AuthorizedRound = NonNullable<Awaited<ReturnType<typeof lockPreparationRoundAccess>>>;

  expectTypeOf<AuthorizedRound>().not.toMatchTypeOf<RoundStep>();
  expectTypeOf<LockedWorkspace>().toMatchTypeOf<WorkspaceStep>();
  expectTypeOf<LockedFundingRound>().toMatchTypeOf<RoundStep>();
  expectTypeOf<LockedApplicationCase>().toMatchTypeOf<CaseRead>();
  expectTypeOf<Transaction>().not.toMatchTypeOf<CaseRead>();
  expectTypeOf<LockedWorkspace>().not.toMatchTypeOf<RoundStep>();
  expectTypeOf<LockedFundingRound>().not.toMatchTypeOf<CaseRead>();
  expectTypeOf<LockedApplicationCase>().not.toMatchTypeOf<WorkspaceStep>();
  expectTypeOf<LockedApplicationCase>().not.toMatchTypeOf<RoundStep>();
});
