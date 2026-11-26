import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Button } from "../components/button/button";
import { Select } from "../components/fields/select/select";
import { TextField } from "../components/fields/text-field/text-field";
import { Icon } from "../components/icon/icon";
import { Reading, Stack } from "../components/layout/layout";
import { Link } from "../components/link/link";
import { Text } from "../components/text/text";
import styles from "./foundations.stories.module.css";

const meta = {
  title: "Design language",
  tags: ["!autodocs"],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const colorExamples = [
  { meaning: "Funding judgment", label: "Recommend funding", ink: "foreground", fill: "surface" },
  { meaning: "Selected item", label: "Application selected", ink: "action", fill: "action-subtle" },
  { meaning: "Completed action", label: "Changes saved", ink: "success", fill: "success-subtle" },
  {
    meaning: "Needs attention",
    label: "Submission changed",
    ink: "warning",
    fill: "warning-subtle",
  },
  {
    meaning: "Failed action",
    label: "Couldn’t save changes",
    ink: "danger",
    fill: "danger-subtle",
  },
];

export const SemanticColors: Story = {
  render: () => (
    <dl className={styles.samples}>
      {colorExamples.map(({ meaning, label, ink, fill }) => (
        <div key={meaning}>
          <dt>{meaning}</dt>
          <dd>
            <span
              className={styles.swatch}
              style={{ color: `var(--${ink})`, background: `var(--${fill})` }}
            >
              {label}
            </span>
            <code>
              --{ink} / --{fill}
            </code>
          </dd>
        </div>
      ))}
    </dl>
  ),
};

export const ReadingAndComparison: Story = {
  render: () => (
    <Stack gap={6}>
      <Stack gap={2}>
        <Text as="p" variant="caption">
          Workshop Saturdays, Applicant submission v2
        </Text>
        <Reading as="p">
          We plan to run twelve Saturday workshops at the community centre. The venue is providing
          the room and equipment. We are requesting funding for materials and two workshop leaders.
        </Reading>
      </Stack>
      <table className={styles.amounts}>
        <caption>Requested funding</caption>
        <thead>
          <tr>
            <th scope="col">Cost</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Materials</th>
            <td>€2,400</td>
          </tr>
          <tr>
            <th scope="row">Workshop leaders</th>
            <td>€12,000</td>
          </tr>
        </tbody>
      </table>
    </Stack>
  ),
};

const recommendations = [
  { id: "fund", label: "Fund" },
  { id: "defer", label: "Defer" },
];

export const FocusComparison: Story = {
  render: () => (
    <section id="focus-comparison" aria-labelledby="focus-title" className={styles.example}>
      <h1 id="focus-title">Control focus</h1>
      <p>
        Tab through the controls, then hover or click them. Switch themes to compare the same focus
        cues on each surface. Disabled controls are skipped; read-only values remain focusable.
      </p>
      <div className={styles.columns}>
        <section aria-label="Actions" className={styles.stack}>
          <h2>Actions</h2>
          <div className={styles.actions}>
            <Button>Save recommendation</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="quiet">View details</Button>
            <Button variant="destructive">Delete draft</Button>
            <Button variant="quiet" iconOnly aria-label="More actions">
              <Icon name="more" />
            </Button>
          </div>
          <div className={styles.actions}>
            <Link variant="primary" href="#focus-comparison">
              Open round
            </Link>
            <Link variant="secondary" href="#focus-comparison">
              Browse rounds
            </Link>
          </div>
          <Button isDisabled>Unavailable action</Button>
        </section>
        <section aria-label="Fields" className={styles.stack}>
          <h2>Fields</h2>
          <TextField label="Applicant" defaultValue="Community Arts" />
          <TextField
            label="Contact name"
            defaultValue="A"
            isInvalid
            errorMessage="Use at least two characters."
          />
          <TextField label="Reference" defaultValue="GR-1042" isReadOnly />
          <TextField label="Summary" defaultValue="A community-led arts programme." multiline />
          <TextField
            label="Submitted summary"
            defaultValue="Original application text."
            multiline
            isReadOnly
          />
          <Select label="Recommendation" items={recommendations} defaultSelectedKey="fund" />
          <Select
            label="Final decision"
            items={recommendations}
            isInvalid
            errorMessage="Choose a decision."
          />
          <TextField label="Unavailable field" isDisabled />
          <Select label="Unavailable selection" items={recommendations} isDisabled />
        </section>
      </div>
    </section>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const button = canvas.getByRole("button", { name: "Save recommendation" });
    button.focus();

    await expect(button).toHaveFocus();
    await expect(button).toHaveAttribute("data-focus-visible", "true");
  },
};
