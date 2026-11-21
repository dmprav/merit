import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn } from "storybook/test";

import { DescriptionList, DescriptionListItem } from "@merit/ui/description-list";

import { AdminMessages } from "../../../app/messages";
import { NameEditor } from "./organization-editors";
import styles from "./organization.module.css";

const meta = {
  title: "Features/Administration/Name editor",
  component: NameEditor,
  tags: ["!autodocs"],
  decorators: [
    (Story) => (
      <AdminMessages>
        <div className={styles.details}>
          <DescriptionList layout="rows" divided>
            <DescriptionListItem label="Organization name">
              <div className={styles.recordEditor}>
                <Story />
              </div>
            </DescriptionListItem>
          </DescriptionList>
        </div>
      </AdminMessages>
    ),
  ],
  args: {
    disabled: false,
    editor: {
      ready: true,
      editing: true,
      value: "Alder Foundation",
      hasDraft: false,
      pending: false,
      open: fn(),
      change: fn(),
      save: fn(async () => null),
      cancel: fn(),
    },
  },
} satisfies Meta<typeof NameEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Editing: Story = {};
export const Preparing: Story = {
  args: { editor: { ...meta.args.editor, ready: false } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Edit name" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Preparing editor…");
    await expect(canvas.getByRole("button", { name: "Close" })).toBeEnabled();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
