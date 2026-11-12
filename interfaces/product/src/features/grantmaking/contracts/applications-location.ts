import { publicIdSchema } from "@merit/grantmaking/api";

export type ApplicationsSearch = {
  round?: string;
  sort?: "application" | "applicant" | "round" | "intake";
  direction?: "ascending" | "descending";
};

export const applicationsSearch = (search: Record<string, unknown>): ApplicationsSearch => ({
  round: publicIdSchema.safeParse(search.round).success ? String(search.round) : undefined,
  sort:
    search.sort === "application" ||
    search.sort === "applicant" ||
    search.sort === "round" ||
    search.sort === "intake"
      ? search.sort
      : undefined,
  direction: search.direction === "descending" ? "descending" : undefined,
});

export const workspaceApplicationsLocation = (
  workspaceSlug: string,
  search: ApplicationsSearch = {},
) => ({
  to: "/app/$workspaceSlug/applications" as const,
  params: { workspaceSlug },
  search,
});
