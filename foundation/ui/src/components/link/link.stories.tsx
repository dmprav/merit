import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import linkStyles from "@merit/ui/link.module.css";

import { Brand } from "../brand/brand";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { Inline, Reading, Stack } from "../layout/layout";
import localStyles from "./link.stories.module.css";

const meta = {
  title: "Components/Link",
  parameters: {
    docs: {
      description: {
        component:
          "Use native anchors or router links for destinations. Apply text for underlined links within prose; add standalone for separate controls with optional icons and 44px touch targets. Use button with data-variant (primary, secondary, or quiet) to match adjacent buttons, data-size=small for compact labels, or data-size=large for prominent site entry points. Links share Button's hover, press, and focus treatments. Keep labels specific to their destination and announce when a link opens a new tab.",
      },
    },
  },
  render: () => (
    <a href="#evidence" className={linkStyles.text}>
      View supporting evidence
    </a>
  ),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Stack gap={6} className={localStyles.overview}>
      <header>
        <h1 className={localStyles.title}>Links</h1>
        <p className={localStyles.description}>Clear destinations, in the rhythm of the work.</p>
      </header>
      <Stack as="section" gap={3} className={localStyles.example}>
        <h2 className={localStyles.label}>Within a sentence</h2>
        <Reading as="p">
          Before making a recommendation, read the{" "}
          <a href="#evidence" className={linkStyles.text}>
            supporting evidence
          </a>{" "}
          and check the{" "}
          <a href="#criteria" className={linkStyles.text}>
            funding criteria
          </a>
          .
        </Reading>
      </Stack>
      <Stack as="section" gap={3} className={localStyles.example}>
        <h2 className={localStyles.label}>Related destinations</h2>
        <Inline gap={6}>
          <a href="#rounds" className={`${linkStyles.text} ${linkStyles.standalone}`}>
            <Icon name="left" /> All funding rounds
          </a>
          <a href="#evidence" className={`${linkStyles.text} ${linkStyles.standalone}`}>
            View evidence <Icon name="forward" />
          </a>
          <a
            href="https://example.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Applicant website (opens in a new tab)"
            className={`${linkStyles.text} ${linkStyles.standalone}`}
          >
            Applicant website <Icon name="arrow" />
          </a>
        </Inline>
      </Stack>
      <Stack as="section" gap={3} className={localStyles.example}>
        <h2 className={localStyles.label}>Alongside actions</h2>
        <Inline>
          <Button>Add evidence</Button>
          <a href="#evidence" className={linkStyles.button} data-variant="secondary">
            View evidence <Icon name="forward" />
          </a>
          <a href="#rounds" className={linkStyles.button} data-variant="quiet">
            Back to round
          </a>
        </Inline>
      </Stack>
      <Stack as="section" gap={3} className={localStyles.example}>
        <h2 className={localStyles.label}>Site entry point</h2>
        <Inline>
          <a href="#demo" className={linkStyles.button} data-variant="primary" data-size="large">
            Explore the demo <Icon name="forward" />
          </a>
        </Inline>
      </Stack>
    </Stack>
  ),
};

export const Default: Story = {};
export const Standalone: Story = {
  render: () => (
    <a href="#evidence" className={`${linkStyles.text} ${linkStyles.standalone}`}>
      View supporting evidence <Icon name="forward" />
    </a>
  ),
};
export const ButtonAppearance: Story = {
  render: () => (
    <Stack>
      <Inline>
        <a href="#round" className={linkStyles.button} data-variant="primary">
          Open funding round
        </a>
        <Button>Create funding round</Button>
      </Inline>
      <Inline>
        <a href="#evidence" className={linkStyles.button} data-variant="secondary">
          Read supporting evidence
          <Icon name="forward" />
        </a>
        <Button variant="secondary">Add evidence</Button>
      </Inline>
      <Inline>
        <a href="#guide" className={linkStyles.button} data-variant="secondary" data-size="small">
          Read the guide
        </a>
        <Button variant="secondary" size="small">
          Copy address
        </Button>
      </Inline>
      <Inline>
        <a href="#demo" className={linkStyles.button} data-variant="primary" data-size="large">
          Explore the demo <Icon name="forward" />
        </a>
        <Button size="large">Request access</Button>
      </Inline>
      <Inline>
        <a href="#workspace" className={linkStyles.button} data-variant="quiet">
          <Icon name="exit" />
          Leave workspace
        </a>
        <Button variant="quiet">
          <Icon name="reset" />
          Reset example
        </Button>
      </Inline>
    </Stack>
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("link", { name: "Open funding round" })).toHaveFocus();
  },
};

export const LongLabels: Story = {
  render: () => (
    <Stack className={localStyles.narrow}>
      <Reading as="p">
        Read the{" "}
        <a href="#evidence" className={linkStyles.text}>
          supporting evidence and assessment for the community-led neighbourhood programme
        </a>{" "}
        before recording your recommendation.
      </Reading>
      <a href="#evidence" className={`${linkStyles.text} ${linkStyles.standalone}`}>
        <span>View supporting evidence for the community-led neighbourhood programme</span>
        <Icon name="forward" />
      </a>
      <a href="#evidence" className={linkStyles.text}>
        evidence.community-foundation.example/2027/neighbourhood-programme/assessment
      </a>
    </Stack>
  ),
};
export const BrandLink: Story = {
  render: () => (
    <a href="#home" aria-label="Merit home">
      <Brand />
    </a>
  ),
};
export const Focused: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.tab();
    const link = canvas.getByRole("link", { name: "View supporting evidence" });
    link.focus();
  },
};
