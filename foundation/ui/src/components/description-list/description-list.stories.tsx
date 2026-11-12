import type { Meta, StoryObj } from "@storybook/react-vite";

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
          "DescriptionList and DescriptionListItem present read-only label/value pairs with native dl, dt, and dd semantics. They own typography, item spacing, and wrapping. Values share a 32px minimum row, with text, identities, and controls vertically centered; long content can grow. Features supply labels, values, formatting, and conditional items. Use the list's className for placement and responsive columns; keep surrounding panels and their accessible labels in the feature.",
      },
    },
  },
  render: () => (
    <DescriptionList>
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

export const LongContent: Story = {
  render: () => (
    <DescriptionList className={styles.narrow}>
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
