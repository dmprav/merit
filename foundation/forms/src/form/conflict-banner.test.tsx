import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { MessagesProvider } from "@merit/i18n";

import { ConflictBanner, RetainedDraftNotice } from "./conflict-banner";

describe("ConflictBanner", () => {
  it("renders title, attribution, recovery actions, and toggles latest preview outside the warning notice", async () => {
    const user = userEvent.setup();
    const keepMine = vi.fn();
    const useSaved = vi.fn();

    render(
      <MessagesProvider messages={{}}>
        <ConflictBanner
          title="Round changed"
          message="Someone saved newer changes while you were editing."
          attribution="Updated by Alex · 2m ago"
          keepMine={{ label: "Keep my changes", onPress: keepMine }}
          useSaved={{ label: "Discard & load latest", onPress: useSaved }}
          latest={{
            toggleLabel: "View latest",
            hideLabel: "Hide latest",
            heading: "Latest saved purpose",
            children: <p>Latest saved text</p>,
          }}
        />
      </MessagesProvider>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Round changed");
    expect(alert).toHaveTextContent("Updated by Alex · 2m ago");
    expect(screen.queryByText("Latest saved text")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View latest" }));
    const preview = screen.getByRole("region", { name: "Latest saved purpose" });
    expect(preview).toHaveTextContent("Latest saved text");
    expect(alert).not.toContainElement(preview);

    await user.click(screen.getByRole("button", { name: "Hide latest" }));
    expect(screen.queryByText("Latest saved text")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep my changes" }));
    expect(keepMine).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Discard & load latest" }));
    expect(useSaved).toHaveBeenCalledOnce();
  });
});

describe("RetainedDraftNotice", () => {
  it("copies retained text to the clipboard and handles copy failures", async () => {
    const user = userEvent.setup();
    const onDiscard = vi.fn();
    const writeText = vi
      .fn<Clipboard["writeText"]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <MessagesProvider messages={{}}>
        <RetainedDraftNotice
          title="Unsaved draft"
          message="Access ended before this draft could save."
          copyLabel="Copy draft"
          copyingLabel="Copying…"
          copiedLabel="Draft copied"
          copyFailedLabel="Could not copy draft."
          discardLabel="Discard draft"
          textToCopy="My unsaved reasoning"
          onDiscard={onDiscard}
        >
          <p>My unsaved reasoning</p>
        </RetainedDraftNotice>
      </MessagesProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    expect(writeText).toHaveBeenCalledWith("My unsaved reasoning");
    expect(await screen.findByText("Draft copied")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Copy draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy draft.");

    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
