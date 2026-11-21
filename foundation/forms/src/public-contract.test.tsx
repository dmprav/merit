import { expectTypeOf, it } from "vite-plus/test";

import type { EscapeHatches } from "@merit/test-support/ui/public-contract";

import type * as forms from "./index";

it("keeps presentation and interaction with the shared form components", () => {
  expectTypeOf<EscapeHatches<typeof forms>>().toEqualTypeOf<never>();
});
