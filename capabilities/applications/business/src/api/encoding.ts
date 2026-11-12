import { moneyDataSchema } from "@merit/money";

import {
  encodeApplicationMaterial as encodeMaterial,
  decodeApplicationMaterial as decodeMaterial,
} from "../domain/encoding";
import { applicationMaterialSchema, type ApplicationMaterial } from "../domain/model";

const publicMaterialSchema = applicationMaterialSchema.pick({
  title: true,
  version: true,
  requested: true,
  submission: true,
  evidence: true,
});
export const applicationMaterialDataSchema = publicMaterialSchema.extend({
  requested: moneyDataSchema.nullable(),
});

export const encodeApplicationMaterial = (input: ApplicationMaterial) =>
  encodeMaterial(publicMaterialSchema.parse(input));

export const decodeApplicationMaterial = (input: unknown): ApplicationMaterial =>
  decodeMaterial(applicationMaterialDataSchema.parse(input));
