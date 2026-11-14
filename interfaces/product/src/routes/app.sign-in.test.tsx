import { describe, expect, it } from "vite-plus/test";

import { Route } from "./app.sign-in";

const validateSearch = (returnTo: unknown) => {
  const validator = Route.options.validateSearch;
  return typeof validator === "function" ? validator({ returnTo }) : {};
};

describe("app.sign-in returnTo validation", () => {
  const assignmentId = "00000000-0000-4000-a000-000000000001";
  const invitationToken = "a".repeat(64);

  it.each([
    "/admin/access-requests",
    "/admin/organizations",
    "/app",
    "/app/alder",
    "/app/alder/rounds",
    "/app/alder/rounds/local-connections-k7m2p9x4n6rt",
    "/app/alder/applications/workshop-saturdays-b8q3w5j7c2df",
    "/app/alder/settings/members",
    "/reviews",
    `/reviews/${assignmentId}`,
    `/invitations/${invitationToken}`,
  ])("allows %s", (returnTo) => {
    expect(validateSearch(returnTo)).toEqual({ returnTo });
  });

  it.each([
    "https://evil.example/app",
    "http://localhost:3000/app",
    "//evil.example/app",
    "///app",
    "/\\evil.example",
    `${"javascript"}:alert(1)`,
    "/app-evil",
    "/app/",
    "/app/sign-in",
    "/app/sign-in/callback",
    "/app/alder?next=https://evil.example",
    "/app/alder#fragment",
    "/app/../admin/organizations",
    "/reviews-evil",
    "/reviews/not-a-uuid",
    `/reviews/${assignmentId}/extra`,
    `/invitations/${"a".repeat(63)}`,
    `/invitations/${"a".repeat(65)}`,
    `/invitations/${"g".repeat(64)}`,
    "/admin",
    "/admin/other",
    "/admin/access-requests/extra",
    "/admin/organizations/extra",
    "/demo",
    " /app",
    "/app\n",
    "/app\r",
    "/reviews\n",
    "/app/sign-in\n",
    "",
  ])("rejects %s", (returnTo) => {
    expect(validateSearch(returnTo)).toEqual({ returnTo: undefined });
  });

  it("rejects non-string values", () => {
    expect(validateSearch(undefined)).toEqual({ returnTo: undefined });
    expect(validateSearch(null)).toEqual({ returnTo: undefined });
    expect(validateSearch(123)).toEqual({ returnTo: undefined });
    expect(validateSearch(["/app"])).toEqual({ returnTo: undefined });
  });
});
