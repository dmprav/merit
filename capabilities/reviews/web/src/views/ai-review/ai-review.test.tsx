import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { Toasts } from "@merit/ui/toast";

import type { AiReviewData } from "../../contracts/ai-review";
import {
  aiReviewDataFixture,
  aiReviewFixture,
  earlierAiReviewFixture,
  outdatedAiReviewFixture,
} from "../../testing/ai-review.fixtures";
import { GrantmakingMessagesProvider } from "../../testing/providers";
import { AiReviewContent } from "./ai-review-content";
import { AiReviewFeedback } from "./ai-review-feedback";
import { AiReviewOverview } from "./ai-review-overview";
import { useAiReviewWork } from "./use-ai-review-work";

const Harness = ({
  data,
  onInspectVersion,
}: {
  data: AiReviewData;
  onInspectVersion?: (version: number) => void;
}) => {
  const work = useAiReviewWork(data);
  if (!work) {
    return null;
  }
  return (
    <>
      <AiReviewOverview work={work} onSelect={work.reading.open} />
      <AiReviewContent work={work} onInspectVersion={onInspectVersion} />
      <AiReviewFeedback work={work} />
      <Toasts />
    </>
  );
};

const show = (data: AiReviewData, onInspectVersion?: (version: number) => void) =>
  render(<Harness data={data} onInspectVersion={onInspectVersion} />, {
    wrapper: GrantmakingMessagesProvider,
  });

const section = () => within(screen.getByRole("region", { name: "AI review details" }));

describe("AI review section", () => {
  it("offers the first run and says what it sends before anything is sent", () => {
    show(aiReviewDataFixture());

    expect(screen.getByText("No AI review yet.")).toBeVisible();
    expect(
      screen.getByText(
        "Sends this application's current material and the round's criteria to OpenAI (gpt-5.1). Takes up to about two minutes.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Run AI review" })).toBeEnabled();
  });

  it.each([
    [
      "consent_required",
      "An organization owner or administrator must turn on Merit AI for this workspace before Merit can send application material to the AI provider.",
    ],
    ["provider_unconfigured", "Merit AI isn't set up on this server."],
    ["withdrawn", "Withdrawn applications can't be reviewed."],
    [
      "demo",
      "The demo shows a prepared example. Running new AI reviews isn't available in the demo.",
    ],
  ] as const)("explains %s in visible text instead of offering a run", (availability, message) => {
    show(aiReviewDataFixture({ availability, reviews: [aiReviewFixture()] }));

    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Run/ })).not.toBeInTheDocument();
    // Saved reviews stay readable whatever the availability.
    expect(screen.getByRole("button", { name: /Merit AI/ })).toBeVisible();
  });

  it("shows the latest review as a Merit AI choice with its date, model, position and basis", () => {
    show(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    const entry = screen.getByRole("button", { name: /Merit AI/ });
    expect(entry).toHaveTextContent("18 January 2027 · gpt-5.1");
    expect(entry).toHaveTextContent("Fund");
    expect(entry).toHaveTextContent("Proposed amount: €24,000");
    expect(entry).toHaveTextContent("Reviewed v1");
    expect(screen.queryByText("No AI review yet.")).not.toBeInTheDocument();
  });

  it("qualifies an outdated review and offers Run again", () => {
    show(aiReviewDataFixture({ reviews: [outdatedAiReviewFixture()] }));

    expect(screen.getByRole("button", { name: /Merit AI/ })).toHaveTextContent(
      "Based on an earlier submission",
    );
    expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
  });

  it("still offers Run again when the latest review is current", () => {
    show(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    expect(screen.getByRole("button", { name: "Run again" })).toBeEnabled();
  });

  it("keeps the run pending, announces it and prevents a second run", async () => {
    const user = userEvent.setup();
    const run = vi.fn<AiReviewData["run"]>().mockReturnValue(new Promise(() => {}));
    show(aiReviewDataFixture({ run }));

    await user.click(screen.getByRole("button", { name: "Run AI review" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Running the AI review. This takes up to about two minutes.",
    );
    expect(screen.getByRole("button", { name: "Running AI review…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(run).toHaveBeenCalledOnce();
  });

  it("states that nothing was saved after a failure and tries again", async () => {
    const user = userEvent.setup();
    const run = vi
      .fn<AiReviewData["run"]>()
      .mockResolvedValueOnce({ status: "failed" })
      .mockReturnValue(new Promise(() => {}));
    show(aiReviewDataFixture({ run }));

    await user.click(screen.getByRole("button", { name: "Run AI review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The AI review couldn't be completed. Nothing was saved.",
    );
    expect(screen.queryByRole("button", { name: "Run AI review" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("button", { name: "Running AI review…" })).toHaveFocus();
    expect(run).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains a refusal at save time with the matching availability message", async () => {
    const user = userEvent.setup();
    show(
      aiReviewDataFixture({
        run: vi.fn().mockResolvedValue({ status: "not_available", availability: "withdrawn" }),
      }),
    );

    await user.click(screen.getByRole("button", { name: "Run AI review" }));

    expect(await screen.findByText("Withdrawn applications can't be reviewed.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Run/ })).not.toBeInTheDocument();
  });

  it("does not claim a lost connection saved nothing", async () => {
    const user = userEvent.setup();
    show(aiReviewDataFixture({ run: vi.fn().mockRejectedValue(new Error("Network")) }));

    await user.click(screen.getByRole("button", { name: "Run AI review" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Merit couldn't confirm the AI review.");
    expect(alert).not.toHaveTextContent("Nothing was saved");
    expect(within(alert).getByRole("button", { name: "Refresh" })).toBeVisible();
  });

  it("confirms a saved review and recovers when only the refresh failed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const refresh = vi
        .fn<AiReviewData["refresh"]>()
        .mockRejectedValueOnce(new Error("Offline"))
        .mockRejectedValueOnce(new Error("Offline"))
        .mockRejectedValueOnce(new Error("Offline"))
        .mockResolvedValue(undefined);
      const run = vi
        .fn<AiReviewData["run"]>()
        .mockResolvedValue({ status: "ok", review: aiReviewFixture() });
      show(aiReviewDataFixture({ run, refresh }));

      await user.click(screen.getByRole("button", { name: "Run AI review" }));
      await vi.advanceTimersByTimeAsync(4000);

      const recovery = await screen.findByRole("alertdialog", {
        name: "Saved, but the latest AI reviews could not be loaded.",
      });
      await user.click(within(recovery).getByRole("button", { name: "Refresh" }));

      await waitFor(() =>
        expect(screen.queryByRole("alertdialog", { name: /Saved, but/ })).toBeNull(),
      );
      expect(run).toHaveBeenCalledOnce();
      expect(refresh).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AI review in full", () => {
  const open = async (data: AiReviewData, onInspectVersion?: (version: number) => void) => {
    const user = userEvent.setup();
    show(data, onInspectVersion);
    await user.click(screen.getByRole("button", { name: /Merit AI/ }));
    return user;
  };

  it("shows who ran it, with what, the funding position and the note that it is not an assessment", async () => {
    await open(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    const full = section();
    expect(full.getByRole("heading", { name: "AI review" })).toHaveFocus();
    expect(full.getByText("Merit AI")).toBeVisible();
    // The header carries the run date and model beside the author, as the overview entry does.
    expect(full.getByText(/^.+ · gpt-5\.1$/)).toBeVisible();
    expect(full.getByText("gpt-5.1")).toBeVisible();
    expect(full.getByText("OpenAI")).toBeVisible();
    expect(full.getByText("Dana Reed")).toBeVisible();
    expect(full.getByText("Fund")).toBeVisible();
    expect(full.getByText("Proposed amount: €24,000")).toBeVisible();
    expect(
      full.getByText(
        "AI review. Merit AI's interpretation of the application material, not an assessment by a reviewer.",
      ),
    ).toBeVisible();
    expect(full.getByRole("heading", { name: "Reasoning" })).toBeVisible();
  });

  it("states no funding for a deferral", async () => {
    await open(
      aiReviewDataFixture({
        reviews: [
          aiReviewFixture({ position: "Defer", amount: { minorUnits: "0", currency: "EUR" } }),
        ],
      }),
    );

    expect(section().getByText("No funding proposed")).toBeVisible();
    expect(section().queryByText(/Proposed amount/)).not.toBeInTheDocument();
  });

  it("lists each criterion with quoted citations labelled by their field or question, omitting empty lists", async () => {
    await open(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    const connection = within(section().getByRole("region", { name: "Community connection" }));
    expect(connection.getByRole("heading", { name: "Claims" })).toBeVisible();
    expect(connection.getByText("\u201cweekly shared meal over 24 weeks\u201d")).toBeVisible();
    expect(connection.getByText("Quoted from Project overview")).toBeVisible();
    expect(connection.getByText("Quoted from Application title")).toBeVisible();
    expect(connection.getByRole("heading", { name: "Gaps" })).toBeVisible();
    expect(connection.getByRole("heading", { name: "Strengths" })).toBeVisible();
    expect(connection.queryByRole("heading", { name: "Weaknesses" })).not.toBeInTheDocument();
    expect(connection.queryByRole("heading", { name: "Concerns" })).not.toBeInTheDocument();

    const demand = within(section().getByRole("region", { name: "Evidence of demand" }));
    expect(demand.getByRole("heading", { name: "Weaknesses" })).toBeVisible();
    expect(demand.getByRole("heading", { name: "Concerns" })).toBeVisible();
    expect(demand.getByText("Quoted from Community need")).toBeVisible();
  });

  it("reads like a recorded assessment: outcome, basis, note, reasoning, criteria, questions, then run details", async () => {
    await open(aiReviewDataFixture({ reviews: [outdatedAiReviewFixture()] }));

    const full = section();
    const order = [
      full.getByText("Proposed amount: €24,000"),
      full.getByText("Based on an earlier submission"),
      full.getByText(/^AI review\. Merit AI's interpretation/),
      full.getByRole("heading", { name: "Reasoning" }),
      full.getByRole("region", { name: "Community connection" }),
      full.getByRole("heading", { name: "Questions for the applicant" }),
      full.getByRole("region", { name: "Run details" }),
    ];
    order.slice(1).forEach((element, index) => {
      expect(
        order[index]!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });

  it("lists the run details with the recorded-assessment date format and provenance wording", async () => {
    await open(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    const details = within(section().getByRole("region", { name: "Run details" }));
    expect(details.getByText(/^18 January 2027.*09:30 UTC$/)).toBeVisible();
    expect(details.getByText("Interface")).toBeVisible();
    expect(details.getByText("via Merit web")).toBeVisible();
    expect(details.getAllByText("Version 1")).toHaveLength(2);
  });

  it("names a quoted question the saved review could not resolve as an application question", async () => {
    const review = aiReviewFixture();
    review.criteria[1]!.claims[0]!.citations[0]!.label = null;
    await open(aiReviewDataFixture({ reviews: [review] }));

    expect(
      within(section().getByRole("region", { name: "Evidence of demand" })).getByText(
        "Quoted from Application question",
      ),
    ).toBeVisible();
  });

  it("numbers the questions for the applicant", async () => {
    await open(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    const list = section().getByRole("list", { name: "Questions for the applicant" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(aiReviewFixture().questions);
    expect(list.tagName).toBe("OL");
  });

  it("notes when the review has no questions", async () => {
    await open(aiReviewDataFixture({ reviews: [aiReviewFixture({ questions: [] })] }));

    expect(section().getByText("No questions for the applicant.")).toBeVisible();
  });

  it("names a whole-application section as stored", async () => {
    await open(
      aiReviewDataFixture({
        reviews: [
          aiReviewFixture({
            criteria: [
              {
                criterionId: null,
                title: "Whole application",
                claims: [],
                gaps: ["No budget was provided."],
                strengths: [],
                weaknesses: [],
                concerns: [],
              },
            ],
          }),
        ],
      }),
    );

    expect(
      within(section().getByRole("region", { name: "Whole application" })).getByText(
        "No budget was provided.",
      ),
    ).toBeVisible();
  });

  it("offers Compare changes for an outdated review and goes back to the section's trigger", async () => {
    const onInspectVersion = vi.fn();
    const user = await open(
      aiReviewDataFixture({ reviews: [outdatedAiReviewFixture()] }),
      onInspectVersion,
    );

    await user.click(section().getByRole("button", { name: "Compare changes" }));
    expect(onInspectVersion).toHaveBeenCalledWith(1);

    await user.click(section().getByRole("button", { name: "Back to assessments" }));
    expect(screen.queryByRole("region", { name: "AI review details" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Merit AI/ })).toHaveFocus();
  });

  it("keeps earlier runs behind a disclosure and opens one in full", async () => {
    const earlier = earlierAiReviewFixture();
    const user = await open(aiReviewDataFixture({ reviews: [aiReviewFixture(), earlier] }));

    const disclosure = section().getByRole("button", { name: /^Earlier AI reviews/ });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await user.click(disclosure);
    const timeline = section().getByRole("list", { name: "Earlier AI reviews" });
    expect(within(timeline).getByText("12 January 2027 · gpt-5.1")).toBeVisible();
    expect(within(timeline).getByText("Fund with a condition")).toBeVisible();
    expect(within(timeline).getByText("Based on an earlier submission")).toBeVisible();
    expect(within(timeline).getByText("Run by Dana Reed")).toBeVisible();

    await user.click(within(timeline).getByRole("button", { name: "Open" }));
    expect(section().getByText("Proposed amount: €18,000")).toBeVisible();
    expect(section().queryByRole("button", { name: /Earlier AI reviews/ })).not.toBeInTheDocument();

    await user.click(section().getByRole("button", { name: "Back to AI review" }));
    expect(section().getByText("Proposed amount: €24,000")).toBeVisible();
    expect(section().getByRole("button", { name: /^Earlier AI reviews/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(section().getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("shows no earlier-runs disclosure for a single review", async () => {
    await open(aiReviewDataFixture({ reviews: [aiReviewFixture()] }));

    expect(section().queryByRole("button", { name: /Earlier AI reviews/ })).not.toBeInTheDocument();
  });
});
