import type {
  ApplicationDocumentFile,
  ApplicationDocuments,
  SourceDocumentRole,
} from "@merit/applications/api";

export type DocumentFileResult =
  | ApplicationDocumentFile
  | { status: "not_found" }
  | { status: "invalid"; error: "version_not_found" }
  | { status: "unavailable" | "signed_out" };

export type ApplicationDocumentSession = {
  attach?: (input: {
    role: SourceDocumentRole;
    filename: string;
    contentBase64: string;
    expectedVersion: number;
  }) => Promise<
    | { status: "ok"; version: number; documents: ApplicationDocuments }
    | { status: "not_found" | "conflict" }
    | {
        status: "invalid";
        error: "not_pdf" | "too_large" | "unreadable_pdf" | "application_withdrawn";
      }
    | { status: "unavailable" | "signed_out" }
  >;
  cite?: (input: {
    role: SourceDocumentRole;
    version: number;
    page: number;
    note?: string;
  }) => Promise<
    | { status: "ok"; citationId: string; documents: ApplicationDocuments }
    | { status: "not_found" }
    | {
        status: "invalid";
        error:
          | "page_out_of_range"
          | "version_not_found"
          | "note_too_long"
          | "application_withdrawn";
      }
    | { status: "unavailable" | "signed_out" }
  >;
  readFile: (input: { role: SourceDocumentRole; version: number }) => Promise<DocumentFileResult>;
  refresh?: () => Promise<void>;
};
