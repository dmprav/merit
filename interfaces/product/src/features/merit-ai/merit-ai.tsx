import type { ConnectConnectionAdapter } from "@tanstack/ai-client";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type { ApplicationShell } from "@merit/ui/application-shell";

import { demoOptions } from "../demo/data/demo";
import { publicIdFromRef } from "../grantmaking/contracts/resource-url";
import { useShortcut } from "../navigation/search-shortcut";
import type { PageContext, ScriptId } from "./contracts";
import { useMeritAiChat } from "./controllers/use-merit-ai-chat";
import { useMeritAiPanel } from "./controllers/use-merit-ai-panel";
import { askApplicant } from "./data/ask-applicant";
import { panelWidthStorage } from "./data/panel-width";
import { createScriptedConnection } from "./data/scripts";
import { MeritAiComposer, MeritAiConversation } from "./views/merit-ai-conversation";

type Companion = NonNullable<ComponentProps<typeof ApplicationShell>["companion"]>;

/** What the application shell needs to offer Merit AI: the panel and a way to open it. */
type MeritAiShell = { companion: Companion; open: () => void };

/** How a conversation is connected and whether its panel starts open; previews and tests replace it. */
type Setup = {
  createConnection: (questions: Record<ScriptId, string>) => ConnectConnectionAdapter;
  isInitiallyOpen: boolean;
};

export const MeritAiSetup = createContext<Setup>({
  createConnection: (questions) => createScriptedConnection({ questions }),
  isInitiallyOpen: false,
});

const MeritAiContext = createContext<MeritAiShell | undefined>(undefined);

/** The shell's Merit AI, or nothing where this workspace has none. */
export const useMeritAiShell = () => useContext(MeritAiContext);

/**
 * Merit AI for a demo workspace. The conversation, the panel's state, and the shortcut live here,
 * above the shell's panel, which remounts its content when the screen crosses 1400 pixels and
 * stays open as the person moves between pages.
 */
export const MeritAi = ({
  workspaceSlug,
  children,
}: {
  workspaceSlug: string;
  children: ReactNode;
}) => {
  const { t } = useTranslation("meritAi");
  const setup = useContext(MeritAiSetup);
  const [connection] = useState(() =>
    setup.createConnection({ changes: t("suggestions.changes"), venue: t("suggestions.venue") }),
  );
  const panel = useMeritAiPanel({
    isInitiallyOpen: setup.isInitiallyOpen,
    widthStorage: panelWidthStorage,
  });
  // The example's reference is only needed once the panel opens.
  const demo = useQuery({ ...demoOptions(workspaceSlug), enabled: panel.isOpen });
  const exampleRef =
    demo.data?.status === "ready" && demo.data.workspaceSlug === workspaceSlug
      ? demo.data.applicationRef
      : undefined;
  // The page's reference is canonical (`<slug>-<id>`) and the demo's is the bare public ID.
  const examplePublicId = exampleRef === undefined ? null : publicIdFromRef(exampleRef);
  const context: PageContext | undefined =
    panel.attachedApplicationRef === undefined
      ? undefined
      : {
          applicationRef: panel.attachedApplicationRef,
          isExample:
            examplePublicId !== null &&
            publicIdFromRef(panel.attachedApplicationRef) === examplePublicId,
        };
  const chat = useMeritAiChat({ connection, tools: [askApplicant], context });
  useShortcut("j", panel.toggle);
  const box = useRef<HTMLDivElement>(null);
  const chip =
    panel.chipTitle === undefined ? undefined : { title: panel.chipTitle, onRemove: panel.detach };

  const ask = (question: string) => {
    chat.send(question);
    // The control that asked may leave with the question; the box is where the person carries on.
    box.current?.querySelector("textarea")?.focus();
  };

  const shell: MeritAiShell = {
    open: panel.open,
    companion: {
      label: t("title"),
      isOpen: panel.isOpen,
      onClose: panel.close,
      closeLabel: t("close"),
      resizeLabel: t("resize"),
      width: panel.width,
      onWidthChange: panel.saveWidth,
      children: (
        <MeritAiConversation chat={chat} canSuggest={context?.isExample === true} onAsk={ask} />
      ),
      footer: <MeritAiComposer chat={chat} chip={chip} onSend={ask} boxRef={box} />,
    },
  };

  return <MeritAiContext value={shell}>{children}</MeritAiContext>;
};
