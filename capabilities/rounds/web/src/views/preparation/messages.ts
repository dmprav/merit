import type { TFunction } from "i18next";

import { decodeMoney, type Money } from "@merit/money";
import type { PreparationSaveError } from "@merit/rounds/api";

import type { PreparationProblem } from "../../controllers/preparation/use-round-preparation";

export const preparationError = (
  t: TFunction<"roundPreparation">,
  failure: PreparationProblem | null,
  money: (value: Money) => string,
  action: "save" | "delete" = "save",
): string | null => {
  if (!failure) {
    return null;
  }
  switch (failure.status) {
    case "busy":
      return t("editor.saving");
    case "conflict":
      return t(action === "delete" ? "preparation.deleteConflict" : "preparation.conflict");
    case "not_found":
    case "signed_out":
      return t("preparation.accessLost");
    case "unavailable":
      return t(action === "delete" ? "preparation.deleteError" : "preparation.saveError");
    case "invalid": {
      const errors = {
        invalid_budget: "validation.amountFormat",
        budget_reason_required: "preparation.reasonRequired",
        manager_unavailable: "preparation.managerUnavailable",
        round_not_empty: "preparation.notEmpty",
        budget_below_commitments: "preparation.budgetBelowCommitments",
        invalid_round: "preparation.saveError",
      } as const satisfies Record<PreparationSaveError, string>;
      return t(errors[failure.error], {
        committed: failure.committed ? money(decodeMoney(failure.committed)) : "",
      });
    }
  }
};
