import type { Actor } from "@merit/auth";

type NotFound = { status: "not_found" };

type Conflict = { status: "conflict" };

type Invalid<Error extends string> = { status: "invalid"; error: Error };

type Saved<Error extends string> =
  | { status: "ok"; revision: number }
  | NotFound
  | Conflict
  | Invalid<Error>;

type Created<Error extends string> = { status: "ok"; publicId: string } | NotFound | Invalid<Error>;

import type { SelectContactRequest } from "./commands/application-contact";
import type {
  CreateApplicationRequest,
  EditApplicationRequest,
  IntakeSaveError,
} from "./commands/intake";

export interface ApplicationsService {
  selectContact: (
    actor: Actor,
    input: SelectContactRequest,
  ) => Promise<Saved<"contact_unavailable">>;
  createApplication: (
    actor: Actor,
    input: CreateApplicationRequest,
  ) => Promise<Created<"invalid_application" | "application_deleted" | "request_total_too_large">>;
  editApplication: (actor: Actor, input: EditApplicationRequest) => Promise<Saved<IntakeSaveError>>;
}
