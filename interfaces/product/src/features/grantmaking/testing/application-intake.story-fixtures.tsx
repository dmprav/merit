import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { mocked } from "storybook/test";

import type { IntakeState } from "@merit/applications-web/contracts";
import type { IntakeSession } from "@merit/applications-web/intake";
import { materialVersionSchema } from "@merit/applications/domain";
import { intakeContent, prepareIntakeChange } from "@merit/applications/domain";
import { ApplicationView } from "@merit/grantmaking-web/applications";
import { GrantmakingDrafts } from "@merit/grantmaking-web/drafts";
import { ApplicationContainedPreview } from "@merit/grantmaking-web/testing";
import { decodeApplicationDetail, encodeApplicationDetail } from "@merit/grantmaking/api";
import { roundView } from "@merit/grantmaking/api";
import { getExampleRound } from "@merit/grantmaking/examples";
import { fromMinorUnits } from "@merit/money";
import { reviewRevisionSchema } from "@merit/reviews/domain";

import { StoryEnvironment } from "../../../../tests/storybook";
import { readContacts } from "../../contacts/data/server/contacts.functions";
import { workspaceIntakeData } from "../data/intake/workspace-data";
import { applicationOptions } from "../data/queries";
import { selectContact } from "../data/server/applications/application-contact.functions";
import { readFundingApplicationPage } from "../data/server/funding-round.functions";
import { readApplicationHistory } from "../data/server/history.functions";
import { editApplication } from "../data/server/intake/intake.functions";

const round = { ...getExampleRound(), id: "k7m2p9x4n6rt" };
export const original = round.applications[0]!;
export const contacts = [
  {
    id: "60000000-0000-4000-8000-000000000001",
    name: "Leah Martin",
    email: "leah@example.test",
    affiliation: "Neighbourhood Kitchen",
    archived: false,
    revision: 0,
    applicationTitles: [],
  },
  {
    id: "60000000-0000-4000-8000-000000000002",
    name: "Sam Morgan",
    email: "sam@example.test",
    affiliation: "",
    archived: false,
    revision: 0,
    applicationTitles: [],
  },
];
const recordedAt = "2026-11-09T10:00:00Z";
export const publicId = "m7n2p9x4k6rt";

type Page = Extract<Awaited<ReturnType<typeof readFundingApplicationPage>>, { status: "ok" }>;

const fixture = (
  state:
    | "incomplete"
    | "complete"
    | "ready"
    | "awaiting-reviews"
    | "revision"
    | "correction"
    | "history"
    | "withdrawn",
): Page => {
  const preparing = state === "incomplete" || state === "complete";
  const application = {
    ...original,
    id: publicId,
    contactId: state === "incomplete" ? null : contacts[0]!.id,
    ...(state === "history"
      ? { version: materialVersionSchema.parse(2), requested: fromMinorUnits(2800000n) }
      : {}),
    intakeStatus: preparing ? ("in_preparation" as const) : ("ready" as const),
    ...(state === "awaiting-reviews"
      ? {
          reviews: {
            ...original.reviews,
            requests: [
              ...original.reviews.requests,
              ...["Jules Patel", "Maya Thompson"].map((reviewer, index) => ({
                id: `70000000-0000-4000-8000-00000000010${index}`,
                contactId: `60000000-0000-4000-8000-00000000010${index}`,
                reviewer,
                applicationVersion: original.version,
                criteriaVersion: round.criteriaVersion,
                criteria: round.criteria,
                status: "outstanding" as const,
                recorder: { userId: "dana", name: "Dana Reed", recordedAt },
                closedBy: null,
              })),
            ],
          },
        }
      : {}),
    ...(state === "withdrawn"
      ? {
          withdrawal: {
            withdrawnOn: "2026-11-03",
            reason:
              "The applicant secured funding from a regional foundation and asked us to stop work on this application. They may apply again next year, so please keep the material and our review notes in case they return with an updated plan.",
            recorder: { userId: "dana", name: "Dana Reed", recordedAt },
          },
        }
      : {}),
    ...(preparing
      ? {
          assessments: [],
          reviews: { revision: reviewRevisionSchema.parse(0), requests: [], assessments: [] },
          managerRecommendation: null,
        }
      : {}),
    ...(state === "incomplete"
      ? { requested: null, summary: "", submission: { version: 1, answers: [] } }
      : {}),
  };
  const revision: IntakeState["workingRevision"] = {
    kind: state === "correction" ? "correction" : "revision",
    reason: "Include accessible transport to the venue.",
    content: { ...intakeContent(application), requested: "28000.00" },
  };

  return {
    status: "ok",
    ...encodeApplicationDetail({ application, round }),
    workspaceSlug: "alder",
    recommendationVersion: 0,
    intake: {
      revision: 2,
      workingRevision: state === "revision" || state === "correction" ? revision : null,
      history:
        state === "history"
          ? [
              {
                revision: 2,
                action: "application.revision_recorded",
                actor: "Dana Reed",
                provenance: { interface: "mcp", clientId: "example-client" },
                reason: revision.reason,
                recordedAt,
                before: encodeApplicationDetail({
                  application: { ...original, version: materialVersionSchema.parse(1) },
                  round,
                }).application,
                after: encodeApplicationDetail({
                  application: {
                    ...original,
                    version: materialVersionSchema.parse(2),
                    requested: fromMinorUnits(2800000n),
                  },
                  round,
                }).application,
              },
            ]
          : [],
    },
  };
};

const ApplicationSession = ({ initial }: { initial: Page }) => {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({ ...applicationOptions("alder", publicId), initialData: initial });
  const page = data.status === "ok" ? data : initial;
  const { application, round: context } = decodeApplicationDetail(page);
  const session: IntakeSession = {
    data: workspaceIntakeData(client, "alder", publicId, page.intake),
    onDeleted: () =>
      navigate({
        to: "/app/$workspaceSlug/rounds/$roundRef",
        params: { workspaceSlug: "alder", roundRef: "community-k7m2p9x4n6rt" },
      }),
  };

  return (
    <ApplicationView
      application={application}
      round={context}
      intake={session}
      intakeState={page.intake}
    />
  );
};

export const ApplicationManagementPreview = ({
  state = "incomplete",
}: {
  state?: Parameters<typeof fixture>[0];
}) => (
  <StoryEnvironment path="/app/alder/applications/neighbour-table">
    <GrantmakingDrafts>
      <ApplicationContainedPreview locationKey={original.title}>
        <ApplicationSession initial={fixture(state)} />
      </ApplicationContainedPreview>
    </GrantmakingDrafts>
  </StoryEnvironment>
);

export const configureIntake = (state: Parameters<typeof fixture>[0] = "incomplete") => {
  let page = fixture(state);
  mocked(readApplicationHistory).mockImplementation(async () => ({
    status: "ok",
    entries: page.intake.history,
    nextCursor: null,
  }));
  mocked(readContacts).mockResolvedValue({
    status: "ok",
    workspaceName: "Alder Foundation",
    contacts,
  });
  mocked(readFundingApplicationPage).mockImplementation(async () => page);
  mocked(selectContact).mockImplementation(async ({ data }) => {
    if (data.expectedRevision !== page.intake.revision) {
      return { status: "conflict" };
    }
    const { application, round: context } = decodeApplicationDetail(page);
    const contact = contacts.find((item) => item.id === data.contactId);
    page = {
      ...page,
      ...encodeApplicationDetail({
        application: {
          ...application,
          contactId: data.contactId,
          submission: {
            ...application.submission,
            version: application.version,
            answers: application.submission?.answers ?? [],
            contact: contact?.name ?? "",
            contactEmail: contact?.email ?? "",
          },
        },
        round: context,
      }),
      intake: { ...page.intake, revision: page.intake.revision + 1 },
    };
    return { status: "ok", revision: page.intake.revision };
  });
  mocked(editApplication).mockImplementation(async ({ data }) => {
    const { application, round: context } = decodeApplicationDetail(page);
    const changed = prepareIntakeChange(
      application,
      page.intake.workingRevision,
      data.change,
      {
        userId: "dana",
        name: "Dana Reed",
        recordedAt,
      },
      {
        hasReviews: Boolean(
          application.reviews.requests.length || application.reviews.assessments.length,
        ),
        hasRecommendation: application.managerRecommendation !== null,
      },
    );
    if (!changed.ok) {
      return { status: "invalid", error: changed.error };
    }

    let updated = changed.application;
    if (
      (data.change.action === "save_content" || data.change.action === "save_revision") &&
      data.change.contactId !== undefined
    ) {
      const contactId = data.change.contactId;
      const contact = contacts.find((item) => item.id === contactId);
      updated = {
        ...changed.application,
        contactId: data.change.contactId,
        submission: {
          ...changed.application.submission,
          version: changed.application.version,
          answers: changed.application.submission?.answers ?? [],
          contact: contact?.name ?? "",
          contactEmail: contact?.email ?? "",
        },
      };
    }
    const next = roundView({
      ...round,
      applications: [{ ...application, ...updated }],
    }).applications[0]!;
    page = {
      ...page,
      ...encodeApplicationDetail({ application: next, round: context }),
      intake: {
        ...page.intake,
        revision: page.intake.revision + 1,
        workingRevision: changed.workingRevision,
      },
    };

    return { status: "ok", revision: page.intake.revision };
  });
};
