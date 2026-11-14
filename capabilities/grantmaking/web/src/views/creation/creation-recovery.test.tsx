import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";

import { createQueryClient } from "@merit/query";

import type { CreationDraft } from "../../contracts/creation";
import { DraftContext } from "../../controllers/creation/drafts";
import { GrantmakingMessagesProvider } from "../../messages";
import { CreateAction } from "./creation-composer";

const recovered: CreationDraft = {
  requestId: "original-retry",
  title: "Recovered round",
  body: "Unfinished purpose",
  amount: "12,",
  meetingDate: "",
  applicant: "",
};

const setup = () => {
  const client = createQueryClient();
  const update = vi.fn();

  const Harness = ({ ready, restored }: { ready: boolean; restored?: CreationDraft }) => {
    const [local, setLocal] = useState<Record<string, CreationDraft | undefined> | null>(null);
    return (
      <QueryClientProvider client={client}>
        <GrantmakingMessagesProvider>
          <p>Saved round list</p>
          <DraftContext
            value={{
              ready,
              creations: local ?? { round: restored },
              setCreation: (key, value) => {
                if (!ready) {
                  throw new Error("Draft changed before recovery");
                }
                update(value);
                setLocal((previous) => ({ ...previous, [key]: value }));
              },
            }}
          >
            <CreateAction
              data={{
                draftKey: "round",
                target: { kind: "round", workspaceSlug: "alder", workspaceName: "Alder" },
                create: vi.fn(),
                refresh: vi.fn(),
                open: vi.fn(),
              }}
              renderCreatedLink={() => null}
            />
          </DraftContext>
        </GrantmakingMessagesProvider>
      </QueryClientProvider>
    );
  };

  const view = render(<Harness ready={false} />);
  return {
    update,
    user: userEvent.setup(),
    finish: (restored?: CreationDraft) => view.rerender(<Harness ready restored={restored} />),
  };
};

it("keeps saved content visible and opens only recovered writing with its retry identity", async () => {
  const { user, finish, update } = setup();
  expect(screen.getByText("Saved round list")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Create funding round" }));
  expect(screen.getByRole("dialog", { name: "Create funding round" })).toBeVisible();
  expect(screen.getByText("Preparing editor…")).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();

  finish(recovered);
  const title = screen.getByRole("textbox", { name: "Round name" });
  expect(title).toHaveValue(recovered.title);
  await waitFor(() => expect(title).toHaveFocus());
  await user.type(title, " updated");
  expect(update).toHaveBeenLastCalledWith({ ...recovered, title: "Recovered round updated" });
});

it("cancels a pending opening without clearing the recovered draft", async () => {
  const { user, finish, update } = setup();
  await user.click(screen.getByRole("button", { name: "Create funding round" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  finish(recovered);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Resume funding round" }));
  expect(screen.getByRole("textbox", { name: "Round name" })).toHaveValue(recovered.title);
});

it("initializes a usable memory-only editor when recovery finishes without a draft", async () => {
  const { user, finish, update } = setup();
  await user.click(screen.getByRole("button", { name: "Create funding round" }));
  finish();
  expect(screen.getByRole("textbox", { name: "Round name" })).toHaveValue("");
  expect(update).toHaveBeenCalledOnce();
});
