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

import type {
  CreateRoundRequest,
  EditRoundRequest,
  DeleteRoundRequest,
  PreparationSaveError,
} from "./commands/preparation";

export interface RoundsService {
  createRound: (
    actor: Actor,
    input: CreateRoundRequest,
  ) => Promise<Created<"invalid_round" | "round_deleted">>;
  editRound: (actor: Actor, input: EditRoundRequest) => Promise<Saved<PreparationSaveError>>;
  deleteRound: (
    actor: Actor,
    input: DeleteRoundRequest,
  ) => Promise<
    { status: "ok" } | NotFound | Conflict | Invalid<"invalid_round" | "round_not_empty">
  >;
}
