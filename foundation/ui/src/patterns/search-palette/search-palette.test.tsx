import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { SearchPalette, type SearchPaletteGroup } from "./search-palette";

const open = vi.fn();

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
    open.mockClear();
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
    open.mockClear();
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
    open.mockClear();
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

  it("opens the highlighted row on Enter and a clicked row on click, passing modifiers through", async () => {
    open.mockClear();
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
