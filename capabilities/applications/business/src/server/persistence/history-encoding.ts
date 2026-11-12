import { fromMinorUnits } from "@merit/money";

import type { WorkingRevision } from "../../domain/intake";
import type { IntakeApplication } from "../../domain/model";
import { encodeIntakeApplication } from "./encoding";
import { applicationHistorySchema } from "./history-format";

export type IntakeSnapshot = {
  application: IntakeApplication;
  workingRevision: WorkingRevision | null;
};

export const encodeApplicationHistory = (value: IntakeSnapshot) =>
  applicationHistorySchema.parse({
    formatVersion: 1,
    application: encodeIntakeApplication(value.application),
    workingRevision: value.workingRevision,
  });

export const decodeApplicationHistory = (input: unknown): IntakeSnapshot => {
  const { application, workingRevision } = applicationHistorySchema.parse(input);
  return {
    application: {
      ...application,
      requested:
        application.requested === null
          ? null
          : fromMinorUnits(BigInt(application.requested.minorUnits)),
    },
    workingRevision,
  };
};
