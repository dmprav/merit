import type { TFunction } from "i18next";

import type { IntakeSaveError } from "@merit/applications/api";

import type { IntakeFailure } from "../../contracts/intake";

export const intakeError = (
  t: TFunction<"applicationIntake">,
  failure: IntakeFailure | null,
): string | null => {
  if (!failure) {
    return null;
  }
  switch (failure.status) {
    case "busy":
      return t("editor.saving");
    case "conflict":
      return t("intake.conflict");
    case "not_found":
    case "signed_out":
      return t("preparation.accessLost");
    case "unavailable":
      return t("intake.saveError");
    case "invalid": {
      const errors = {
        contact_unavailable: "intake.contactUnavailable",
        request_total_too_large: "intake.requestTotalTooLarge",
        incomplete_application: "intake.incomplete",
        reason_required: "intake.reasonHint",
        unchanged_revision: "intake.unchanged",
        application_in_use: "intake.inUse",
        revision_unavailable: "intake.revisionUnavailable",
        revision_required: "intake.revisionRequired",
        invalid_application: "intake.saveError",
      } as const satisfies Record<IntakeSaveError, string>;
      return t(errors[failure.error]);
    }
  }
};
