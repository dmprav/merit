export * from "./commands/intake";
export * from "./commands/application-contact";
export {
  applicationMaterialDataSchema,
  encodeApplicationMaterial,
  decodeApplicationMaterial,
} from "../domain/encoding";
export type { ApplicationsService } from "./service";
