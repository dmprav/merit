import { applicationFilters, type ApplicationFilter } from "@merit/grantmaking-web/contracts/pages";
import { publicIdSchema } from "@merit/grantmaking/api";

export type ApplicationsSearch = {
  round?: string;
  filter?: Exclude<ApplicationFilter, "all">;
  sort?: "application" | "applicant" | "round" | "intake";
  direction?: "ascending" | "descending";
};

const isApplicationFilter = (value: unknown): value is Exclude<ApplicationFilter, "all"> =>
  typeof value === "string" &&
  value !== "all" &&
  (applicationFilters as readonly string[]).includes(value);

export const applicationsSearch = (search: Record<string, unknown>): ApplicationsSearch => ({
  round: publicIdSchema.safeParse(search.round).success ? String(search.round) : undefined,
  filter: isApplicationFilter(search.filter) ? search.filter : undefined,
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
