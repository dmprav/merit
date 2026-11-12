import { decodeMoney, encodeMoney, moneyDataSchema } from "@merit/money";

import {
  applicationMaterialSchema,
  intakeApplicationSchema,
  type ApplicationMaterial,
  type IntakeApplication,
} from "./model";

const materialDataSchema = applicationMaterialSchema.extend({
  requested: moneyDataSchema.nullable(),
});
const intakeDataSchema = intakeApplicationSchema.extend({ requested: moneyDataSchema.nullable() });

export const encodeApplicationMaterial = (input: ApplicationMaterial) => {
  const value = applicationMaterialSchema.parse(input);
  return { ...value, requested: value.requested === null ? null : encodeMoney(value.requested) };
};

export const decodeApplicationMaterial = (input: unknown): ApplicationMaterial => {
  const value = materialDataSchema.parse(input);
  return applicationMaterialSchema.parse({
    ...value,
    requested: value.requested === null ? null : decodeMoney(value.requested),
  });
};

export const encodeIntakeApplication = (input: IntakeApplication) => {
  const value = intakeApplicationSchema.parse(input);
  return { ...value, requested: value.requested === null ? null : encodeMoney(value.requested) };
};

export const decodeIntakeApplication = (input: unknown): IntakeApplication => {
  const value = intakeDataSchema.parse(input);
  return intakeApplicationSchema.parse({
    ...value,
    requested: value.requested === null ? null : decodeMoney(value.requested),
  });
};
