import { createHash } from "node:crypto";

import type { EvalCase } from "./definition";

export const fingerprintSuite = (selected: EvalCase[], readOnlyTools: readonly string[]) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        // Bump when changing setup, scoring, or trial grants.
        graderVersion: 15,
        selected,
        readOnlyToolNames: [...readOnlyTools].sort(),
      }),
    )
    .digest("hex");
