import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";

import { AdminMessages } from "../../../app/messages";
import { invitation } from "./invitation.fixtures";
import { OrganizationsTable } from "./organizations-table";

const OrganizationListExample = (
  props: Omit<ComponentProps<typeof OrganizationsTable>, "view" | "onViewChange">,
) => {
  const [view, setView] = useState<ComponentProps<typeof OrganizationsTable>["view"]>({
    sorting: null,
  });
  return <OrganizationsTable {...props} view={view} onViewChange={setView} />;
};

const meta = {
  title: "Features/Administration/Organizations",
  tags: ["!autodocs"],
  component: OrganizationListExample,
  args: { organizations: [], renderLink: (org) => <a href={`#${org.slug}`}>{org.name}</a> },
  decorators: [
    (Story) => (
      <AdminMessages>
        <Story />
      </AdminMessages>
    ),
  ],
} satisfies Meta<typeof OrganizationListExample>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  args: {
    organizations: [
      {
        id: "1",
        hasOwner: false,
        name: "Alder Foundation",
        slug: "alder",
        invitation: { ...invitation, organizationId: "1" },
      },
      {
        id: "2",
        hasOwner: false,
        name: "Birch Community Foundation for Arts, Education and Neighbourhood Development",
        slug: "birch-community-foundation",
        invitation: { ...invitation, organizationId: "2", delivery: "failed" },
      },
      { id: "3", hasOwner: false, name: "Cedar Foundation", slug: "cedar", invitation: null },
    ],
  },
};
export const Empty: Story = {};
