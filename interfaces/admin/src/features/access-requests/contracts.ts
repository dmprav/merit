import type { AccessRequest, AccessRequestPage, Result } from "@merit/organizations/api";

type RequestFailure = { status: "signed_out" | "unavailable" };

export type AccessRequestsResult = Result<AccessRequestPage> | RequestFailure;

export type ReviewResult = Result<AccessRequest> | RequestFailure;

export type AccessRequestsData = {
  reviewing: boolean;
  error: Exclude<ReviewResult, { status: "ok" }> | null;
  refreshFailed: boolean;
  refreshing: boolean;
  review: (email: string) => Promise<void>;
  refresh: () => Promise<void>;
};
