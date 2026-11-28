import type { ReactNode } from "react";
import { fn } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import type { ReviewerPage } from "@merit/reviews/api";
import { reviewerSubmission, reviewRevisionSchema, type ReviewState } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { ApplicationPage, ApplicationStage } from "@merit/ui/application-shell";

import type { ReviewerData, ManagerReviewerData } from "../../contracts/reviewer";
import { Messages as ReviewsMessagesProvider } from "../../messages";

const title = "Neighbour Table";
const criteria = [
  {
    id: "c71be2aa-4794-4f1d-b5b7-6e656c2fa086",
    title: "Community connection",
    description: "How will the activity bring local residents together?",
  },
  {
    id: "59a76eae-9d64-4766-b2c5-7cf48aa710bf",
    title: "Evidence of demand",
    description: "What did the group learn from its pilot?",
  },
];
const recorder = { userId: "sam", name: "Sam Morgan", recordedAt: "2027-01-16T10:00:00Z" };

export const reviewerPage = (): ReviewerPage => ({
  assignment: {
    id: "70000000-0000-4000-8000-000000000001",
    requestId: "70000000-0000-4000-8000-000000000002",
    revision: 1,
    status: "accepted",
    reviewer: "Sam Morgan",
    hasSubmitted: false,
    email: "sam@example.test",
    applicationTitle: title,
    applicant: "Neighbourhood Kitchen",
    organization: "Alder Foundation",
    workspaceSlug: "alder",
    dueDate: "2027-02-10",
    managerName: "Dana Reed",
    managerEmail: "dana@example.test",
    applicationVersion: 1,
    criteriaVersion: 1,
    basisComparison: {
      applicationVersion: "same",
      criteriaVersion: "same",
      criteriaContent: "same",
    },
    materialChanged: false,
    criteriaChanged: false,
    conflict: "",
    delivery: "sent",
    notification: null,
    // Keep the invitation example usable without changing the system clock.
    expiresAt: "2099-01-01T00:00:00Z",
  },
  material: {
    title,
    version: materialVersionSchema.parse(1),
    requested: { currency: "EUR", minorUnits: "2400000" },
    submission: {
      version: 1,
      organization: "Neighbourhood Kitchen",
      answers: [
        {
          questionId: "ea6818f9-940d-417b-b094-ed0c0d145f5b",
          question: "Project overview",
          response:
            "Neighbour Table will bring local residents together for a weekly shared meal over 24 weeks. Each session combines cooking, a low-cost lunch and facilitated conversation. We aim to involve 60 residents across the programme, particularly adults living alone who do not currently attend community activities.",
        },
        {
          questionId: "31512cd2-519b-4baa-b9af-f8870df5c084",
          question: "Community need",
          response:
            "Our six-session pilot recorded 90 attendances. We did not count unique people, so this is not a measure of how many residents we reached. Of the 18 attendees who gave feedback, 14 said they would return. We will record unique participants and repeat attendance during the funded programme.",
        },
        {
          questionId: "6cf6d5da-fb0f-4da3-9268-49f572a9c7b7",
          question: "Delivery plan",
          response:
            "The community hall has confirmed all 24 dates. Our coordinator and eight volunteers will prepare the meals and welcome participants. Local community groups will help us reach residents who may be reluctant to attend on their own. Funding covers food, coordination, room hire and volunteer support.",
        },
        {
          questionId: "e327abe8-f952-4789-ac6d-3a6e5e02d8f4",
          question: "Submitted budget breakdown (EUR)",
          response:
            "Food and supplies: €9600.00\nProject coordinator: €8400.00\nHall hire: €3600.00\nVolunteer training and travel: €2400.00",
        },
      ],
    },
    evidence: [
      {
        version: 1,
        passage:
          "Our six-session pilot recorded 90 attendances. We did not count unique people. In feedback from 18 attendees, 14 said they would return. The community hall has confirmed all 24 dates, and our coordinator and eight volunteers will run them.",
      },
    ],
  },
  criteria: structuredClone(criteria),
  assessment: null,
  draft: {
    revision: 1,
    content: {
      position: "Fund",
      amount: "18000",
      reasoning:
        "The free venue and experienced team make the weekly sessions credible. Confirm how the group will track participation.",
      observations: [],
      note: "",
    },
  },
  work: { available: true },
});

export const submittedPage = (): ReviewerPage => {
  const page = reviewerPage();
  page.assignment.status = "submitted";
  page.assignment.hasSubmitted = true;
  page.assessment = {
    id: "a303a3d5-e812-5530-95d7-3f7b6081d2c5",
    contactId: "sam",
    requestId: page.assignment.requestId,
    previousId: null,
    reviewer: "Sam Morgan",
    authorUserId: "sam",
    versions: [
      {
        content: reviewerSubmission(page.draft!.content, page.assignment, false)!,
        criteria: page.criteria,
        recorder,
        note: "",
      },
    ],
  };
  return page;
};

export type SaveScenario = "ordinary" | "saving" | "unavailable" | "conflict" | "revoked";

/** In-memory transport; domain and persistence rules have their own tests. */
export const reviewerTransport = (initial: ReviewerPage, scenario: SaveScenario = "ordinary") => {
  let page = structuredClone(initial);
  let firstSave = true;
  const data: ReviewerData = {
    read: fn<ReviewerData["read"]>(async () => ({
      status: "ok" as const,
      value: structuredClone(page),
    })),
    respond: fn<ReviewerData["respond"]>(async ({ action, note }) => {
      page =
        action === "accept"
          ? { ...reviewerPage(), assignment: { ...page.assignment, status: "accepted" } }
          : {
              ...page,
              assignment: {
                ...page.assignment,
                status: action === "decline" ? "declined" : "conflict",
                conflict: note,
              },
              material: null,
              criteria: null,
              draft: null,
              work: { available: false, reason: "action_unavailable" },
            };
      return { status: "ok", value: page.assignment };
    }),
    save: fn<ReviewerData["save"]>(async ({ draft }) => {
      if (scenario === "saving") {
        return new Promise(() => {});
      }
      if (firstSave && scenario !== "ordinary") {
        firstSave = false;
        if (scenario === "conflict") {
          page.draft = {
            revision: 2,
            content: {
              ...page.draft!.content,
              reasoning:
                "Saved on my other device: confirm the attendance evidence before recommending funding.",
            },
          };
          return { status: "conflict" };
        }
        if (scenario === "revoked") {
          page = {
            ...page,
            assignment: { ...page.assignment, status: "cancelled" },
            material: null,
            criteria: null,
            draft: null,
            work: { available: false, reason: "action_unavailable" },
          };
          return { status: "not_found" };
        }
        return { status: "unavailable" };
      }
      page.draft = { revision: (page.draft?.revision ?? 0) + 1, content: structuredClone(draft) };
      return { status: "ok", value: { revision: page.draft.revision } };
    }),
    submit: fn<ReviewerData["submit"]>(async () => {
      const content =
        page.draft &&
        reviewerSubmission(page.draft.content, page.assignment, Boolean(page.assessment));
      if (!content) {
        return { status: "invalid", error: "submission_incomplete" };
      }
      const assessment = page.assessment ?? submittedPage().assessment!;
      page.assessment = {
        ...assessment,
        versions: [
          ...(page.assessment?.versions ?? []),
          {
            content,
            criteria: page.criteria,
            recorder,
            note: page.draft?.content.note ?? "",
          },
        ],
      };
      page.assignment = { ...page.assignment, status: "submitted", hasSubmitted: true };
      page.draft!.content.note = "";
      return { status: "ok", value: { revision: page.assessment.versions.length } };
    }),
  };
  return data;
};

export const ReviewPreviewFrame = ({
  children,
  manager = false,
}: {
  children: ReactNode;
  manager?: boolean;
}) => {
  const page = (
    <ApplicationPage
      width="full"
      contained={!manager}
      locationKey="review"
      breadcrumb={null}
      breadcrumbLabel="Breadcrumb"
    >
      {children}
    </ApplicationPage>
  );

  return (
    <ReviewsMessagesProvider>
      <ApplicationStage>{page}</ApplicationStage>
    </ReviewsMessagesProvider>
  );
};

export const managerReviews = (): ReviewState => ({
  revision: reviewRevisionSchema.parse(1),
  assessments: [],
  requests: [
    {
      id: reviewerPage().assignment.requestId,
      contactId: "sam",
      reviewer: "Sam Morgan",
      applicationVersion: materialVersionSchema.parse(1),
      criteriaVersion: criteriaVersionSchema.parse(1),
      criteria: criteria,
      status: "outstanding",
      recorder,
      closedBy: null,
    },
  ],
});

export const managerTransport = (
  initial: Awaited<ReturnType<ManagerReviewerData["read"]>>,
  scenario: "ordinary" | "pending" | "failure" | "membership" = "ordinary",
): ManagerReviewerData => {
  let result = structuredClone(initial);
  let firstInvite = true;
  return {
    read: fn<ManagerReviewerData["read"]>(async () => structuredClone(result)),
    refresh: fn<ManagerReviewerData["refresh"]>(async () => {}),
    invite: fn<ManagerReviewerData["invite"]>(async (_request, dueDate) => {
      if (scenario === "membership") {
        return { status: "invalid", error: "workspace_membership_required" };
      }
      if (scenario === "pending") {
        return new Promise(() => {});
      }
      if (scenario === "failure" && firstInvite) {
        firstInvite = false;
        return { status: "unavailable" };
      }
      const assignment = { ...reviewerPage().assignment, status: "invited" as const, dueDate };
      result = { status: "ok", value: [{ ...assignment, history: [] }] };
      return { status: "ok", value: assignment };
    }),
    manage: fn<ManagerReviewerData["manage"]>(async (assignment, action, note) => {
      const changed = { ...assignment, revision: assignment.revision + 1 };
      if (action === "cancel") {
        changed.status = "cancelled";
      }
      if (action === "reinstate" || action === "clear_conflict") {
        changed.status = "invited";
      }
      if (action === "clear_conflict") {
        changed.conflict = "";
      }
      if (action === "resend") {
        changed.delivery = "sent";
        changed.expiresAt = "2099-01-01T00:00:00Z";
      }
      if (action === "retry_notification") {
        changed.notification = "sent";
      }
      result = {
        status: "ok",
        value: [
          {
            ...changed,
            history:
              action === "retry_notification"
                ? []
                : [
                    {
                      action: {
                        cancel: "review_assignment.access_ended",
                        reinstate: "review_assignment.reinstated",
                        clear_conflict: "review_assignment.conflict_cleared",
                        resend: "review_assignment.invitation_renewed",
                      }[action],
                      note,
                      actor: "Dana Reed",
                      at: "2027-01-16T10:00:00Z",
                    },
                  ],
          },
        ],
      };
      return { status: "ok", value: changed };
    }),
  };
};
