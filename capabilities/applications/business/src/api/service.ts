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

import type { ApplicationDocuments, SourceDocumentRole } from "../domain/documents";
import type { SelectContactRequest } from "./commands/application-contact";
import type {
  AttachApplicationDocumentRequest,
  CiteApplicationDocumentRequest,
  ListApplicationDocumentsRequest,
  ReadApplicationDocumentFileRequest,
} from "./commands/documents";
import type {
  CreateApplicationRequest,
  EditApplicationRequest,
  IntakeSaveError,
} from "./commands/intake";

export interface ApplicationsService {
  selectContact: (
    actor: Actor,
    input: SelectContactRequest,
  ) => Promise<Saved<"contact_unavailable" | "application_withdrawn">>;
  createApplication: (
    actor: Actor,
    input: CreateApplicationRequest,
  ) => Promise<Created<"invalid_application" | "application_deleted" | "request_total_too_large">>;
  editApplication: (actor: Actor, input: EditApplicationRequest) => Promise<Saved<IntakeSaveError>>;
  listApplicationDocuments: (
    actor: Actor,
    input: ListApplicationDocumentsRequest,
  ) => Promise<{ status: "ok"; documents: ApplicationDocuments } | NotFound>;
  attachApplicationDocument: (
    actor: Actor,
    input: AttachApplicationDocumentRequest,
  ) => Promise<
    | { status: "ok"; version: number; documents: ApplicationDocuments }
    | NotFound
    | Conflict
    | Invalid<"not_pdf" | "too_large" | "unreadable_pdf" | "application_withdrawn">
  >;
  citeApplicationDocumentPage: (
    actor: Actor,
    input: CiteApplicationDocumentRequest,
  ) => Promise<
    | { status: "ok"; citationId: string; documents: ApplicationDocuments }
    | NotFound
    | Invalid<"page_out_of_range" | "version_not_found" | "note_too_long" | "application_withdrawn">
  >;
  readApplicationDocumentFile: (
    actor: Actor,
    input: ReadApplicationDocumentFileRequest,
  ) => Promise<
    | {
        status: "ok";
        role: SourceDocumentRole;
        version: number;
        filename: string;
        pageCount: number;
        byteSize: number;
        contentBase64: string;
      }
    | NotFound
    | Invalid<"version_not_found">
  >;
}
