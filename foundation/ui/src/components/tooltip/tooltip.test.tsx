import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { Button } from "../button/button";
import { Tooltip } from "./tooltip";

it("describes a focused control, dismisses with Escape, and preserves the action", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(
    <Tooltip content="Set the position, proposed allocation, and reasoning.">
      <Button onPress={onPress}>Edit recommendation</Button>
    </Tooltip>,
  );
  const button = screen.getByRole("button", { name: "Edit recommendation" });

  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

  await user.tab();

  expect(button).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toBeVisible();
  expect(button).toHaveAccessibleDescription(
    "Set the position, proposed allocation, and reasoning.",
  );

  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  expect(button).toHaveFocus();

  await user.keyboard("{Enter}");

  expect(onPress).toHaveBeenCalledOnce();
});
