import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Button } from "../components/button/button";
import { Select } from "../components/fields/select/select";
import { TextField } from "../components/fields/text-field/text-field";
import { Icon } from "../components/icon/icon";
import linkStyles from "../components/link/link.module.css";
import localStyles from "./focus.stories.module.css";

const recommendations = [
  { id: "fund", label: "Fund" },
  { id: "defer", label: "Defer" },
];

const meta = {
  title: "Foundations/Focus",
  render: () => (
    <section id="focus-comparison" aria-labelledby="focus-title" className={localStyles.example}>
      <h1 id="focus-title">Control focus</h1>
      <p>
        Tab through the controls, then hover or click them. Switch themes to compare the same focus
        cues on each surface. Disabled controls are skipped; read-only values remain focusable.
      </p>
      <div className={localStyles.columns}>
        <section aria-label="Actions" className={localStyles.stack}>
          <h2>Actions</h2>
          <div className={localStyles.actions}>
            <Button>Save recommendation</Button>
            <Button variant="secondary">Cancel</Button>
            <Button variant="quiet">View details</Button>
            <Button variant="destructive">Delete draft</Button>
            <Button variant="quiet" iconOnly aria-label="More actions">
              <Icon name="more" />
            </Button>
          </div>
          <div className={localStyles.actions}>
            <a href="#focus-comparison" className={linkStyles.button} data-variant="primary">
              Open round
            </a>
            <a href="#focus-comparison" className={linkStyles.button} data-variant="secondary">
              Browse rounds
            </a>
          </div>
          <Button isDisabled>Unavailable action</Button>
        </section>
        <section aria-label="Fields" className={localStyles.stack}>
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
} satisfies Meta;

export default meta;

export const Comparison: StoryObj<typeof meta> = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const button = canvas.getByRole("button", { name: "Save recommendation" });
    button.focus();

    await expect(button).toHaveFocus();
    await expect(button).toHaveAttribute("data-focus-visible", "true");
  },
};
