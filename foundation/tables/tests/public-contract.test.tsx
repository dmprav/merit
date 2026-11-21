import { expectTypeOf, it } from "vite-plus/test";

import type { EscapeHatches } from "@merit/test-support/ui/public-contract";

import type * as tables from "../src/index";

it("keeps presentation and interaction with the shared table", () => {
  expectTypeOf<EscapeHatches<typeof tables>>().toEqualTypeOf<never>();
});
