import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vite-plus/test";

import { Button } from "./button";

it("ignores presses and stays out of focus order when disabled", async () => {
  const user = userEvent.setup();
  const onPress = vi.fn();
  render(
    <>
      <Button variant="primary" isDisabled onPress={onPress}>
        Primary
      </Button>
      <Button variant="secondary" isDisabled onPress={onPress}>
        Secondary
      </Button>
      <Button variant="quiet" isDisabled onPress={onPress}>
        Quiet
      </Button>
      <Button variant="destructive" isDisabled onPress={onPress}>
        Destructive
      </Button>
    </>,
  );

  const buttons = screen.getAllByRole("button");
  for (const button of buttons) {
    expect(button).toBeDisabled();
    await user.click(button);
    button.focus();
    expect(button).not.toHaveFocus();
  }

  await user.tab();
  for (const button of buttons) {
    expect(button).not.toHaveFocus();
  }

  expect(onPress).not.toHaveBeenCalled();
});
