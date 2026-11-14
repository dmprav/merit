import type { ReviewerSummary } from "@merit/reviews/api";

const assignment: ReviewerSummary = {
  id: "70000000-0000-4000-8000-000000000001",
  requestId: "70000000-0000-4000-8000-000000000002",
  revision: 1,
  status: "invited",
  reviewer: "Robin Ellis",
  hasSubmitted: false,
  email: "reviewer@example.test",
  applicationTitle: "Neighbour Table",
  applicant: "Neighbourhood Kitchen",
  organization: "Alder Foundation",
  workspaceSlug: "alder",
  dueDate: "2027-02-10",
  managerName: "Dana Reed",
  managerEmail: "dana@example.test",
  applicationVersion: 1,
  criteriaVersion: 1,
  basisComparison: { applicationVersion: "same", criteriaVersion: "same", criteriaContent: "same" },
  materialChanged: false,
  criteriaChanged: false,
  conflict: "",
  delivery: "sent",
  notification: null,
  expiresAt: "2099-01-01T00:00:00Z",
};

export const workAssignments: ReviewerSummary[] = [
  assignment,
  {
    ...assignment,
    id: "70000000-0000-4000-8000-000000000003",
    applicationTitle: "Workshop Saturdays",
    status: "accepted",
    dueDate: null,
  },
  {
    ...assignment,
    id: "70000000-0000-4000-8000-000000000004",
    applicationTitle: "Community growing",
    status: "submitted",
    hasSubmitted: true,
  },
];
