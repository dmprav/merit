import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { PersonIdentity } from "../../patterns/person-identity/person-identity";
import { Badge } from "../badge/badge";
import { DescriptionList, DescriptionListItem } from "./description-list";
import styles from "./description-list.stories.module.css";

const meta = {
  title: "Components/Description list",
  component: DescriptionList,
  args: { children: null },
  parameters: {
    docs: {
      description: {
        component:
          "DescriptionList and DescriptionListItem present label/value pairs with native dl, dt, and dd semantics. They own typography, item spacing, and wrapping. Values share a 32px minimum row, with text, identities, and controls vertically centered; long content can grow. Use the default stacked layout for descriptive facts and layout='rows' for compact property panels with labels beside values. Rows return to stacked labels in containers narrower than 17rem. Features supply labels, values, formatting, and conditional items. Use the list's className for placement and responsive columns; keep surrounding panels and their accessible labels in the feature.",
      },
    },
  },
  render: ({ layout, className }) => (
    <DescriptionList layout={layout} className={className}>
      <DescriptionListItem label="Status">
        <Badge>Open</Badge>
      </DescriptionListItem>
      <DescriptionListItem label="Budget">£120,000</DescriptionListItem>
      <DescriptionListItem label="Manager">
        <PersonIdentity name="Dana Reed" />
      </DescriptionListItem>
      <DescriptionListItem label="Reviews submitted">{0}</DescriptionListItem>
    </DescriptionList>
  ),
} satisfies Meta<typeof DescriptionList>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {};
export const Rows: Story = {
  args: { layout: "rows", className: styles.sidebar },
  play: async ({ canvas }) => {
    const label = canvas.getByText("Status").getBoundingClientRect();
    const value = canvas.getByText("Open").getBoundingClientRect();
    await expect(label.right).toBeLessThan(value.left);
    await expect(label.top).toBeLessThan(value.bottom);
    await expect(label.bottom).toBeGreaterThan(value.top);
  },
};

export const LongContent: Story = {
  args: { className: styles.narrow },
  render: ({ layout, className }) => (
    <DescriptionList className={className} layout={layout}>
      <DescriptionListItem label="Application reference supplied by the funding organisation">
        application_01JABCDEFGHIJKLMN0123456789OPQRSTUVWXYZ
      </DescriptionListItem>
      <DescriptionListItem label="Organisation">
        Northside Community Partnerships and Neighbourhood Development Association
      </DescriptionListItem>
      <DescriptionListItem label="Contact">
        <PersonIdentity name="Alexandria Montgomery-Worthington" />
      </DescriptionListItem>
    </DescriptionList>
  ),
};

export const RowsWithLongContent: Story = {
  ...LongContent,
  args: { layout: "rows", className: styles.sidebar },
};

export const NarrowRows: Story = {
  ...LongContent,
  args: { layout: "rows", className: styles.narrow },
  play: async ({ canvas }) => {
    const label = canvas.getByText("Contact").getBoundingClientRect();
    const value = canvas.getByText("Alexandria Montgomery-Worthington").getBoundingClientRect();
    await expect(value.top).toBeGreaterThanOrEqual(label.bottom);
  },
};
