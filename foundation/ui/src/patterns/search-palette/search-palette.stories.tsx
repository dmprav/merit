import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { Button } from "../../components/button/button";
import { Icon } from "../../components/icon/icon";
import { StateMessage } from "../state-message/state-message";
import { SearchPalette, SearchPaletteDialog, type SearchPaletteGroup } from "./search-palette";

const row = (id: string, title: string, detail: string, label?: string) => ({
  id,
  textValue: `${title}, ${detail}`,
  href: `#${id}`,
  renderLink: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a {...props} href={href}>
      {children}
    </a>
  ),
  title,
  detail,
  label,
});

const rounds: SearchPaletteGroup = {
  id: "rounds",
  heading: "Funding rounds",
  items: [row("round-1", "Harbour fund", "Committee meeting 15 Jun 2027")],
};
const applications: SearchPaletteGroup = {
  id: "applications",
  heading: "Applications",
  items: [
    row("application-1", "Boat repairs", "Trust for the Harbour · Harbour fund"),
    row("application-2", "Quayside lights", "Dock committee · Harbour fund", "In preparation"),
    row("application-3", "Old slipway", "Harbour society · Spring grants", "Withdrawn"),
  ],
};

const Example = ({
  initial = "",
  ...props
}: Partial<ComponentProps<typeof SearchPalette>> & { initial?: string }) => {
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(true);
  return (
    <SearchPaletteDialog
      title="Search the workspace"
      closeLabel="Close search"
      trigger={null}
      isOpen={open}
      onOpenChange={setOpen}
    >
      <SearchPalette
        label="Search"
        resultsLabel="Search results"
        value={value}
        onValueChange={setValue}
        groups={[rounds, applications]}
        announcement=""
        announcementId={0}
        {...props}
      />
    </SearchPaletteDialog>
  );
};

const meta = {
  title: "Patterns/Search palette",
  component: SearchPalette,
  parameters: { layout: "fullscreen" },
  args: {
    label: "Search",
    resultsLabel: "Search results",
    value: "",
    onValueChange: fn(),
    groups: [rounds, applications],
    announcement: "",
    announcementId: 0,
  },
  render: (args) => <Example {...args} />,
} satisfies Meta<typeof SearchPalette>;

export default meta;

type Story = StoryObj<typeof meta>;

const dialog = (canvasElement: HTMLElement) =>
  within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "Search the workspace" });

export const Results: Story = {
  args: {
    groups: [
      rounds,
      { ...applications, note: "Showing 3 of 43 applications. Type more to narrow." },
    ],
  },
  play: async ({ canvasElement, userEvent }) => {
    const box = within(await dialog(canvasElement));
    const field = box.getByRole("searchbox", { name: "Search" });

    await waitFor(() => expect(field).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");

    await expect(field).toHaveAttribute(
      "aria-activedescendant",
      box.getByRole("option", { name: /^Boat repairs/ }).id,
    );
  },
};

export const Hint: Story = {
  args: {
    groups: [],
    message: "Search funding rounds and applications by name or applicant.",
  },
};

export const Loading: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    const box = within(await dialog(canvasElement));

    await expect(box.getAllByRole("option")).toHaveLength(4);
  },
};

export const NoMatches: Story = {
  args: {
    groups: [],
    message: (
      <StateMessage
        size="compact"
        illustration={<Icon name="search" />}
        title="No funding rounds or applications match “harbr”."
        description="Search by funding round, application title, or applicant."
      />
    ),
  },
};

export const Failure: Story = {
  args: {
    groups: [],
    message: (
      <StateMessage
        size="compact"
        tone="danger"
        illustration={<Icon name="warning" />}
        title="Search isn’t available right now."
        description="Your search is kept. Try again in a moment."
        actions={
          <Button size="small" variant="secondary">
            <Icon name="reset" />
            Try again
          </Button>
        }
      />
    ),
  },
};
