import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { SearchPalette, SearchPaletteDialog, type SearchPaletteGroup } from "./search-palette";

const open = vi.fn();

beforeEach(() => open.mockClear());

const item = (id: string, title: string, detail?: string, label?: string) => ({
  id,
  textValue: title,
  href: `/records/${id}`,
  renderLink: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        // Like a router link, keep the row's own handlers and then navigate.
        props.onClick?.(event);
        event.preventDefault();
        open(id, { meta: event.metaKey });
      }}
    >
      {children}
    </a>
  ),
  title,
  detail,
  label,
});

const groups: SearchPaletteGroup[] = [
  { id: "rounds", heading: "Funding rounds", items: [item("r1", "Harbour fund", "15 Jun 2027")] },
  {
    id: "applications",
    heading: "Applications",
    items: [
      item("a1", "Boat repairs", "Trust · Harbour fund", "In preparation"),
      item("a2", "Lights", "Dock · Harbour fund"),
    ],
    note: "Showing 2 of 43 applications. Type more to narrow.",
  },
];

const Palette = (props: Partial<React.ComponentProps<typeof SearchPalette>>) => {
  const [value, setValue] = useState("");
  return (
    <SearchPalette
      label="Search workspace"
      resultsLabel="Results"
      value={value}
      onValueChange={setValue}
      groups={groups}
      announcement=""
      announcementId={0}
      {...props}
    />
  );
};

describe("search palette", () => {
  it("renders each group under its heading with real links and a note below its rows", () => {
    render(<Palette />);
    const list = screen.getByRole("listbox", { name: "Results" });
    const applications = within(list).getByRole("group", { name: /^Applications/ });

    expect(within(list).getByRole("group", { name: /^Funding rounds/ })).toBeVisible();
    expect(within(applications).getAllByRole("option")).toHaveLength(2);
    expect(within(applications).getByRole("option", { name: /Boat repairs/ })).toHaveAttribute(
      "href",
      "/records/a1",
    );
    expect(within(applications).getByText("In preparation")).toBeVisible();
    // The note belongs to the group but is not a choice.
    expect(
      within(applications).getByText("Showing 2 of 43 applications. Type more to narrow."),
    ).toBeVisible();
    expect(screen.queryByRole("option", { name: /Showing 2 of 43/ })).not.toBeInTheDocument();
  });

  it("keeps focus in the field while Down and Up move the highlight across groups", async () => {
    const user = userEvent.setup();
    render(<Palette />);
    const field = screen.getByRole("searchbox", { name: "Search workspace" });
    await user.click(field);

    await user.keyboard("{ArrowDown}");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /^Harbour fund/ }).id,
    );

    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /^Lights/ }).id,
    );

    await user.keyboard("{ArrowDown}");
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /^Lights/ }).id,
    );

    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /^Harbour fund/ }).id,
    );
  });

  it("highlights the top match when settled results arrive, so Enter opens it", async () => {
    const user = userEvent.setup();
    const view = render(<Palette groups={[]} message="Search." />);
    const field = screen.getByRole("searchbox");
    await user.type(field, "h");

    view.rerender(<Palette groups={groups} resultsId={1} />);
    const top = screen.getByRole("option", { name: /^Harbour fund/ });
    await waitFor(() => expect(field).toHaveAttribute("aria-activedescendant", top.id));

    await user.keyboard("{Enter}");
    expect(open).toHaveBeenCalledWith("r1", { meta: false });
  });

  it("highlights nothing, and Enter does nothing, while newer results load", async () => {
    const user = userEvent.setup();
    const view = render(<Palette groups={groups} resultsId={1} />);
    const field = screen.getByRole("searchbox");
    await user.type(field, "a");

    view.rerender(<Palette groups={groups} resultsId={1} busy />);
    expect(field).not.toHaveAttribute("aria-activedescendant");
    await user.keyboard("{Enter}");

    expect(open).not.toHaveBeenCalled();
  });

  it("returns the highlight to the top match when a new result set arrives", async () => {
    const user = userEvent.setup();
    const view = render(<Palette groups={groups} resultsId={1} />);
    const field = screen.getByRole("searchbox");
    await user.click(field);
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /^Lights/ }).id,
    );

    await user.type(field, "x");
    view.rerender(<Palette groups={groups} resultsId={1} busy />);
    view.rerender(<Palette groups={[...groups].reverse()} resultsId={2} />);

    const top = screen.getAllByRole("option")[0]!;
    await waitFor(() => expect(field).toHaveAttribute("aria-activedescendant", top.id));
    await user.keyboard("{Enter}");
    expect(open).toHaveBeenLastCalledWith("a1", { meta: false });
  });

  it("steps from the highlighted top match to the next row with Down", async () => {
    const user = userEvent.setup();
    render(<Palette groups={groups} resultsId={1} />);
    const field = screen.getByRole("searchbox");
    await user.click(field);

    await user.keyboard("{ArrowDown}");

    expect(field).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: /^Boat repairs/ }).id,
    );
  });

  it("completes a press on the same action when pending results settle", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    const actions = [
      {
        id: "commands",
        items: [
          {
            id: "create",
            textValue: "Create round",
            title: "Create round",
            availableWhileBusy: true,
            onAction,
          },
        ],
      },
    ];
    const view = render(<Palette busy groups={actions} resultsId={1} />);

    const action = () => screen.getByRole("option", { name: "Create round" });

    await user.pointer({ target: action(), keys: "[MouseLeft>]" });
    view.rerender(<Palette groups={actions} resultsId={2} />);
    await user.pointer({ target: action(), keys: "[/MouseLeft]" });

    expect(onAction).toHaveBeenCalledOnce();
  });

  it("opens the highlighted row on Enter and a clicked row on click, passing modifiers through", async () => {
    const user = userEvent.setup();
    render(<Palette />);
    await user.click(screen.getByRole("searchbox"));

    await user.keyboard("{Enter}");
    expect(open).not.toHaveBeenCalled();

    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(open).toHaveBeenLastCalledWith("a1", { meta: false });

    await user.click(screen.getByRole("option", { name: /^Lights/ }));
    expect(open).toHaveBeenLastCalledWith("a2", { meta: false });

    await user.keyboard("{Meta>}");
    await user.click(screen.getByRole("option", { name: /^Harbour fund/ }));
    expect(open).toHaveBeenLastCalledWith("r1", { meta: true });
  });

  it("reports a row opened in this tab, but not one opened in a new tab", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<Palette onOpen={onOpen} />);
    await user.click(screen.getByRole("searchbox"));

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: "r1" }));

    await user.click(screen.getByRole("option", { name: /^Lights/ }));
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a2" }));

    onOpen.mockClear();
    await user.keyboard("{Control>}");
    await user.click(screen.getByRole("option", { name: /^Lights/ }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("reports typed text and shows a message instead of the results", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Palette message="Search by name." onValueChange={onValueChange} />);

    await user.type(screen.getByRole("searchbox"), "ab");

    expect(onValueChange).toHaveBeenLastCalledWith("b");
    expect(screen.getByText("Search by name.")).toBeVisible();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("marks the results busy without hiding them", () => {
    render(<Palette busy />);

    expect(screen.getByRole("listbox", { name: "Results" }).closest("[aria-busy]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("announces a changed status politely", async () => {
    const { rerender } = render(<Palette announcement="" announcementId={1} />);
    rerender(<Palette announcement="2 funding rounds" announcementId={2} />);

    expect(await screen.findByText("2 funding rounds")).toHaveAttribute("role", "status");
  });
});

it("keeps current actions usable while stale links cannot activate", async () => {
  const onOpen = vi.fn();
  const onAction = vi.fn();
  const user = userEvent.setup();
  render(
    <Palette
      busy
      resultsId={1}
      onOpen={onOpen}
      groups={[
        {
          id: "mixed",
          items: [
            item("stale", "Old record"),
            {
              id: "create",
              textValue: "Create round",
              title: "Create round",
              onAction,
              availableWhileBusy: true,
            },
          ],
        },
      ]}
    />,
  );
  const stale = screen.getByRole("option", { name: "Old record" });
  expect(stale).toHaveAttribute("aria-disabled", "true");
  expect(stale).not.toHaveAttribute("href");
  await user.click(stale);
  expect(onOpen).not.toHaveBeenCalled();
  await user.click(screen.getByRole("searchbox"));
  await user.keyboard("{ArrowDown}{Enter}");
  expect(onAction).toHaveBeenCalledOnce();
});

it("leaves middle-click links to the browser without closing the palette", async () => {
  const onOpen = vi.fn();
  const user = userEvent.setup();
  render(<Palette onOpen={onOpen} />);
  const link = screen.getByRole("option", { name: /^Lights/ });
  await user.pointer({ target: link, keys: "[MouseMiddle]" });
  expect(link).toHaveAttribute("href", "/records/a2");
  expect(onOpen).not.toHaveBeenCalled();
});

it("requires a heading for a group note", () => {
  expectTypeOf<{ id: string; items: []; note: string }>().not.toExtend<SearchPaletteGroup>();
  expectTypeOf<{ id: string; items: [] }>().toExtend<SearchPaletteGroup>();
  expectTypeOf<{
    id: string;
    items: [];
    heading: string;
    note: string;
  }>().toExtend<SearchPaletteGroup>();
});

describe("search palette dialog", () => {
  const SearchDialog = ({ onField }: { onField?: boolean }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setIsOpen(true)}>
          Open search
        </button>
        <SearchPaletteDialog
          title="Search the workspace"
          closeLabel="Close search"
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          data-testid="search-overlay"
        >
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- Test fixture verifies initial focus inside the search dialog. */}
          <input aria-label="Query" autoFocus={onField} />
        </SearchPaletteDialog>
      </>
    );
  };

  it("names the dialog without a visible title bar and offers a small close control", async () => {
    const user = userEvent.setup();
    render(<SearchDialog onField />);
    await user.click(screen.getByRole("button", { name: "Open search" }));
    const dialog = screen.getByRole("dialog", { name: "Search the workspace" });

    expect(within(dialog).queryByRole("heading")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Search the workspace")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Close search" })).toBeVisible();
    await waitFor(() =>
      expect(within(dialog).getByRole("textbox", { name: "Query" })).toHaveFocus(),
    );
  });

  it.each(["Escape", "close button", "outside press"])(
    "closes on %s and returns focus to where it was",
    async (how) => {
      const user = userEvent.setup();
      render(<SearchDialog onField />);
      const opener = screen.getByRole("button", { name: "Open search" });
      await user.click(opener);
      await screen.findByRole("dialog", { name: "Search the workspace" });

      if (how === "Escape") {
        await user.keyboard("{Escape}");
      } else if (how === "close button") {
        await user.click(screen.getByRole("button", { name: "Close search" }));
      } else {
        await user.click(screen.getByTestId("search-overlay"));
      }

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      await waitFor(() => expect(opener).toHaveFocus());
    },
  );
});
