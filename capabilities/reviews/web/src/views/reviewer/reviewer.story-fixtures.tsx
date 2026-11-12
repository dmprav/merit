import type { ReactNode } from "react";
import { fn } from "storybook/test";

import { materialVersionSchema } from "@merit/applications/domain";
import { getExampleRound } from "@merit/grantmaking/examples";
import { encodeMoney } from "@merit/money";
import type { ReviewerPage } from "@merit/reviews/api";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { assessmentInputSchema, type ReviewState } from "@merit/reviews/domain";
import { criteriaVersionSchema } from "@merit/rounds/domain";
import { ApplicationPage } from "@merit/ui/application-shell";
import shellStyles from "@merit/ui/application-shell.module.css";

import type { ReviewerData, ManagerReviewerData } from "../../contracts/reviewer";
import { Messages as GrantmakingMessagesProvider } from "../../messages";
import previewStyles from "./reviewer-preview.module.css";

const round = getExampleRound();
const application = round.applications[0]!;
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
    applicationTitle: application.title,
    applicant: "Neighbourhood Kitchen",
    organization: round.foundation,
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
    title: application.title,
    version: application.version,
    requested: application.requested && encodeMoney(application.requested),
    submission: structuredClone(application.submission),
    evidence: structuredClone(application.evidence),
  },
  criteria: structuredClone(round.criteria),
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
});

export const submittedPage = (): ReviewerPage => {
  const page = reviewerPage();
  page.assignment.status = "submitted";
  page.assignment.hasSubmitted = true;
  page.assessment = {
    id: "assessment-sam",
    contactId: "sam",
    requestId: page.assignment.requestId,
    previousId: null,
    reviewer: "Sam Morgan",
    authorUserId: "sam",
    versions: [
      {
        content: {
          ...page.draft!.content,
          date: "2027-01-16",
          applicationVersion: materialVersionSchema.parse(1),
          criteriaVersion: criteriaVersionSchema.parse(1),
        },
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
              ...draft,
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
          };
          return { status: "not_found" };
        }
        return { status: "unavailable" };
      }
      page.draft = { revision: (page.draft?.revision ?? 0) + 1, content: structuredClone(draft) };
      return { status: "ok", value: { revision: page.draft.revision } };
    }),
    submit: fn<ReviewerData["submit"]>(async () => {
      const content = assessmentInputSchema.safeParse({
        ...page.draft?.content,
        date: "2027-01-16",
        applicationVersion: 1,
        criteriaVersion: 1,
      });
      if (
        !content.success ||
        !content.data.position ||
        (page.assessment && !page.draft?.content.note.trim())
      ) {
        return { status: "invalid" };
      }
      const assessment = page.assessment ?? submittedPage().assessment!;
      page.assessment = {
        ...assessment,
        versions: [
          ...(page.assessment?.versions ?? []),
          {
            content: content.data,
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
    <GrantmakingMessagesProvider>
      {manager ? (
        page
      ) : (
        <div className={`${shellStyles.shell} ${previewStyles.stageOnly}`}>
          <div className={shellStyles.stage}>{page}</div>
        </div>
      )}
    </GrantmakingMessagesProvider>
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
      criteria: round.criteria,
      status: "outstanding",
      recorder,
      closedBy: null,
    },
  ],
});

export const managerTransport = (
  initial: Awaited<ReturnType<ManagerReviewerData["read"]>>,
  scenario: "ordinary" | "pending" | "failure" = "ordinary",
): ManagerReviewerData => {
  let result = structuredClone(initial);
  let firstInvite = true;
  return {
    read: fn<ManagerReviewerData["read"]>(async () => structuredClone(result)),
    refresh: fn<ManagerReviewerData["refresh"]>(async () => {}),
    invite: fn<ManagerReviewerData["invite"]>(async (_request, dueDate) => {
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
            history: [{ action, note, actor: "Dana Reed", at: "2027-01-16T10:00:00Z" }],
          },
        ],
      };
      return { status: "ok", value: changed };
    }),
  };
};
