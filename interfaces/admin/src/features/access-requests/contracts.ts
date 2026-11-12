import type { AccessRequest, Result } from "@merit/organizations/api";

type RequestFailure = { status: "signed_out" | "unavailable" };

export type AccessRequestsResult = Result<AccessRequest[]> | RequestFailure;

export type ReviewResult = Result<AccessRequest> | RequestFailure;

export type AccessRequestsData = {
  reviewing: boolean;
  error: Exclude<ReviewResult, { status: "ok" }> | null;
  refreshFailed: boolean;
  review: (email: string) => Promise<void>;
  refresh: () => Promise<void>;
};
