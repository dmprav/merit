import { encodeIntakeApplication } from "../../domain/encoding";
import type { WorkingRevision } from "../../domain/intake";
import type { IntakeApplication } from "../../domain/model";
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
