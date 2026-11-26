import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { Brand } from "../brand/brand";
import { Button } from "../button/button";
import { Icon } from "../icon/icon";
import { Inline, Reading, Stack } from "../layout/layout";
import { Text } from "../text/text";
import { Link } from "./link";
import localStyles from "./link.stories.module.css";

const meta = {
  title: "Components/Link",
  component: Link,
  args: { href: "#evidence", children: "View supporting evidence" },
} satisfies Meta<typeof Link>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className={localStyles.overview}>
      <Stack gap={6}>
        <header>
          <h1 className={localStyles.title}>Links</h1>
          <p className={localStyles.description}>Clear destinations, in the rhythm of the work.</p>
        </header>
        <section className={localStyles.example}>
          <Stack gap={3}>
            <h2 className={localStyles.label}>Within a sentence</h2>
            <Reading prose={false} as="p">
              Before making a recommendation, read the{" "}
              <Link href="#evidence">supporting evidence</Link> and check the{" "}
              <Link href="#criteria">funding criteria</Link>.
            </Reading>
          </Stack>
        </section>
        <section className={localStyles.example}>
          <Stack gap={3}>
            <h2 className={localStyles.label}>Related destinations</h2>
            <Inline gap={6}>
              <Link variant="standalone" href="#rounds">
                <Icon name="left" /> All funding rounds
              </Link>
              <Link variant="standalone" href="#evidence">
                View evidence <Icon name="forward" />
              </Link>
              <Link
                variant="standalone"
                href="https://example.org"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Applicant website (opens in a new tab)"
              >
                Applicant website <Icon name="arrow" />
              </Link>
            </Inline>
          </Stack>
        </section>
        <section className={localStyles.example}>
          <Stack gap={3}>
            <h2 className={localStyles.label}>Alongside actions</h2>
            <Inline>
              <Button>Add evidence</Button>
              <Link variant="secondary" href="#evidence">
                View evidence <Icon name="forward" />
              </Link>
              <Link variant="quiet" href="#rounds">
                Back to round
              </Link>
            </Inline>
          </Stack>
        </section>
        <section className={localStyles.example}>
          <Stack gap={3}>
            <h2 className={localStyles.label}>Site entry point</h2>
            <Inline>
              <Link variant="primary" size="large" href="#demo">
                Explore the demo <Icon name="forward" />
              </Link>
            </Inline>
          </Stack>
        </section>
      </Stack>
    </div>
  ),
};

export const Default: Story = {};
export const Standalone: Story = {
  render: () => (
    <Link variant="standalone" href="#evidence">
      View supporting evidence <Icon name="forward" />
    </Link>
  ),
};
export const ButtonAppearance: Story = {
  render: () => (
    <Stack>
      <Inline>
        <Link variant="primary" href="#round">
          Open funding round
        </Link>
        <Button>Create funding round</Button>
      </Inline>
      <Inline>
        <Link variant="secondary" href="#evidence">
          Read supporting evidence
          <Icon name="forward" />
        </Link>
        <Button variant="secondary">Add evidence</Button>
      </Inline>
      <Inline>
        <Link variant="secondary" href="#guide">
          Read the guide
        </Link>
        <Button variant="secondary">Copy address</Button>
      </Inline>
      <Inline>
        <Link variant="primary" size="large" href="#demo">
          Explore the demo <Icon name="forward" />
        </Link>
        <Button size="large">Request access</Button>
      </Inline>
      <Inline>
        <Link variant="quiet" href="#workspace">
          <Icon name="exit" />
          Leave workspace
        </Link>
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
    <div className={localStyles.narrow}>
      <Stack>
        <Reading prose={false} as="p">
          Read the{" "}
          <Link href="#evidence">
            supporting evidence and assessment for the community-led neighbourhood programme
          </Link>{" "}
          before recording your recommendation.
        </Reading>
        <Link variant="standalone" href="#evidence">
          <span>View supporting evidence for the community-led neighbourhood programme</span>
          <Icon name="forward" />
        </Link>
        <Link href="#evidence">
          evidence.community-foundation.example/2027/neighbourhood-programme/assessment
        </Link>
      </Stack>
    </div>
  ),
};
export const Rows: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The row variant makes a whole list row one destination, with its title and supporting lines stacked. The list separates its rows.",
      },
    },
  },
  render: () => (
    <div className={localStyles.narrow}>
      <Stack as="ul" gap={1}>
        <li>
          <Link variant="row" href="#neighbour-table">
            <span>Neighbour Table</span>
            <Text variant="supporting">Community grants 2026</Text>
          </Link>
        </li>
        <li>
          <Link variant="row" href="#repair-cafe">
            <span>Saturday repair café</span>
            <Text variant="supporting">Neighbourhood partnerships 2025</Text>
          </Link>
        </li>
      </Stack>
    </div>
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
