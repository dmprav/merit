import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { useIntakeDrafts } from "@merit/applications-web/drafts";
import { intakeSnapshot, newIntakeDraft } from "@merit/applications-web/work";
import { materialVersionSchema } from "@merit/applications/domain";
import { readDraftStorage, seedDraftStorage } from "@merit/drafts/testing";
import { applicationView, roundView } from "@merit/grantmaking/api";
import { makeApplication, makeRound } from "@merit/grantmaking/testing/fixtures";
import { useRecommendationDrafts } from "@merit/recommendations-web/drafts";
import { useReviewDrafts, type ReviewDraft } from "@merit/reviews-web/drafts";
import { reviewRevisionSchema } from "@merit/reviews/domain";
import { usePreparationDrafts } from "@merit/rounds-web/drafts";
import { preparationDraft } from "@merit/rounds-web/work";
import { criteriaVersionSchema } from "@merit/rounds/domain";

import { useCreationDrafts } from "../controllers/creation/drafts";
import { GrantmakingMessagesProvider } from "../messages";
import { GrantmakingDrafts } from "./drafts";

const round = roundView(makeRound());
const roundEdit = { ...preparationDraft("title", round, 3), value: { title: "Round writing" } };
const intakeEdit = {
  ...newIntakeDraft("title", intakeSnapshot(applicationView(makeApplication()), null), 7),
  value: { title: "Application writing" },
};
const creation = {
  requestId: "retry-same-request",
  title: "New round writing",
  body: "Unfinished purpose",
  amount: "12,",
  meetingDate: "",
  applicant: "",
};
const recommendation = {
  value: { position: "Fund" as const, amount: "12,", reasoning: "Unfinished judgment" },
  baseline: { expectedRevision: 4, expectedApplicationVersion: 2 },
};
const review: ReviewDraft = {
  mode: "record",
  id: "new-review",
  replacesId: null,
  revision: reviewRevisionSchema.parse(5),
  applicationVersion: materialVersionSchema.parse(2),
  criteriaVersion: criteriaVersionSchema.parse(3),
  values: {
    contactId: "reviewer",
    applicationVersion: "2",
    criteriaVersion: "3",
    date: "",
    position: "Fund",
    amount: "12,",
    reasoning: "Review writing",
    observations: [],
    note: "",
  },
};
const stored = {
  rounds: { record: roundEdit },
  applications: { record: intakeEdit },
  creations: { record: creation },
  recommendations: { record: recommendation },
  reviews: { record: review },
};
const empty = { rounds: {}, applications: {}, creations: {}, recommendations: {}, reviews: {} };
const updatedCreation = { ...creation, title: "Updated creation" };
const updatedRecommendation = { ...recommendation.value, reasoning: "Updated judgment" };

const Probe = () => {
  const { edits: rounds, ready: roundsReady } = usePreparationDrafts();
  const { applicationEdits: applications, ready: applicationsReady } = useIntakeDrafts();
  const { creations, setCreation, ready: creationsReady } = useCreationDrafts();
  const {
    drafts: recommendations,
    setDraft,
    ready: recommendationsReady,
  } = useRecommendationDrafts();
  const { reviewEdits: reviews, setReviewEdit, ready: reviewsReady } = useReviewDrafts();

  return (
    <>
      <output
        data-testid={
          [
            roundsReady,
            applicationsReady,
            creationsReady,
            recommendationsReady,
            reviewsReady,
          ].every(Boolean)
            ? "drafts"
            : "restoring"
        }
      >
        {JSON.stringify({ rounds, applications, creations, recommendations, reviews })}
      </output>
      <button onClick={() => setCreation("record", updatedCreation)}>Edit creation</button>
      <button onClick={() => setCreation("record", undefined)}>Discard creation</button>
      <button onClick={() => setReviewEdit("record", review)}>Edit review</button>
      <button
        onClick={() =>
          setDraft("record", updatedRecommendation, {
            expectedRevision: 99,
            expectedApplicationVersion: 99,
          })
        }
      >
        Edit recommendation
      </button>
    </>
  );
};

const view = (storageScope?: string) => (
  <GrantmakingMessagesProvider>
    <GrantmakingDrafts storageScope={storageScope}>
      <Probe />
    </GrantmakingDrafts>
  </GrantmakingMessagesProvider>
);

const draftState = (): unknown => JSON.parse(screen.getByTestId("drafts").textContent!);

const warning = () => screen.queryAllByText(/Draft recovery is unavailable/);

const edit = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

const seed = async () => {
  for (const [bucket, drafts] of Object.entries(stored)) {
    await seedDraftStorage("account", bucket, drafts);
  }
};

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

it("recovers all workflow buckets and preserves sibling drafts when creation changes or is discarded", async () => {
  await seed();
  render(view("account"));
  await screen.findByTestId("drafts");

  expect(draftState()).toEqual(stored);
  edit("Edit creation");
  expect(draftState()).toEqual({ ...stored, creations: { record: updatedCreation } });
  await waitFor(async () =>
    expect(await readDraftStorage("account", "creations")).toEqual({ record: updatedCreation }),
  );

  edit("Discard creation");
  expect(draftState()).toEqual({ ...stored, creations: {} });
  for (const [bucket, drafts] of Object.entries(stored)) {
    await waitFor(async () =>
      expect(await readDraftStorage("account", bucket)).toEqual(
        bucket === "creations" ? {} : drafts,
      ),
    );
  }
});

it("isolates scope changes without requiring a caller key and restores the original account", async () => {
  await seed();
  const { rerender } = render(view("account"));
  await screen.findByTestId("drafts");
  expect(draftState()).toEqual(stored);

  for (const scope of ["other-account", "account:demo:new", undefined]) {
    rerender(view(scope));
    await screen.findByTestId("drafts");
    expect(draftState()).toEqual(empty);
  }

  edit("Edit creation");
  expect(sessionStorage.length).toBe(0);
  rerender(view("account"));
  await screen.findByTestId("drafts");
  expect(draftState()).toEqual(stored);
});

it("keeps the recovered recommendation baseline when editing against newer saved data", async () => {
  await seed();
  const { unmount } = render(view("account"));
  await screen.findByTestId("drafts");
  edit("Edit recommendation");
  await waitFor(async () =>
    expect(await readDraftStorage("account", "recommendations")).toEqual({
      record: { value: updatedRecommendation, baseline: recommendation.baseline },
    }),
  );
  unmount();
  render(view("account"));
  await screen.findByTestId("drafts");

  expect(draftState()).toEqual({
    ...stored,
    recommendations: {
      record: { value: updatedRecommendation, baseline: recommendation.baseline },
    },
  });
});

it("keeps previews in memory without reading or writing browser storage", () => {
  const read = vi.spyOn(Storage.prototype, "getItem");
  const write = vi.spyOn(Storage.prototype, "setItem");
  render(view());
  edit("Edit creation");

  expect(draftState()).toEqual({ ...empty, creations: { record: updatedCreation } });
  expect(read).not.toHaveBeenCalled();
  expect(write).not.toHaveBeenCalled();
  expect(warning()).toHaveLength(0);
});

it("shows one warning and keeps edits in memory when browser storage is blocked", async () => {
  const blocked = () => {
    throw new Error("Storage disabled");
  };

  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(blocked);
  render(view("account"));
  await screen.findByTestId("drafts");
  edit("Edit creation");

  expect(draftState()).toEqual({ ...empty, creations: { record: updatedCreation } });
  await waitFor(() => expect(warning()).toHaveLength(1));
});

it("keeps the warning until every failed workflow has persisted successfully", async () => {
  render(view("account"));
  await screen.findByTestId("drafts");
  const write = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  edit("Edit creation");
  edit("Edit review");
  expect(draftState()).toEqual({
    ...empty,
    creations: { record: updatedCreation },
    reviews: { record: review },
  });
  await waitFor(() => expect(warning()).toHaveLength(1));

  await waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  write.mockRestore();
  edit("Edit creation");
  await waitFor(async () =>
    expect(await readDraftStorage("account", "creations")).toEqual({ record: updatedCreation }),
  );
  await waitFor(() => expect(warning()).toHaveLength(1));
  edit("Edit review");
  await waitFor(() => expect(warning()).toHaveLength(0));
  await waitFor(async () =>
    expect(await readDraftStorage("account", "creations")).toEqual({ record: updatedCreation }),
  );
  await waitFor(async () =>
    expect(await readDraftStorage("account", "reviews")).toEqual({ record: review }),
  );
});

it("renders saved page content immediately while all workflow stores recover", async () => {
  await seed();
  render(view("account"));
  expect(screen.getByTestId("restoring")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit creation" })).toBeVisible();
  expect(screen.queryByText("Restoring drafts…")).not.toBeInTheDocument();
  await screen.findByTestId("drafts");
  expect(draftState()).toEqual(stored);
});
