import { useEffect, useSyncExternalStore } from "react";

type ShortcutPlatform = "apple" | "other";

const noSubscription = () => () => {};

const currentPlatform = (): ShortcutPlatform => {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform;
  return /Mac|iPhone|iPad|iPod/.test(platform) ? "apple" : "other";
};

/** The server and first render assume a keyboard with Ctrl, then hydration corrects it. */
export const useShortcutPlatform = () =>
  useSyncExternalStore(noSubscription, currentPlatform, () => "other" as const);

/** ⌘K on Apple platforms and Ctrl+K elsewhere, without other modifiers. */
const isSearchShortcut = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: ShortcutPlatform,
) =>
  event.key.toLowerCase() === "k" &&
  !event.altKey &&
  !event.shiftKey &&
  (platform === "apple" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

/**
 * Calls `onSearch` for the search shortcut from anywhere on the page, including while focus is
 * in a text field, and keeps the browser from using it. Pass nothing to leave the shortcut alone.
 */
export const useSearchShortcut = (onSearch: (() => void) | undefined) => {
  const platform = useShortcutPlatform();

  useEffect(() => {
    if (!onSearch) {
      return;
    }

    const listen = (event: KeyboardEvent) => {
      if (isSearchShortcut(event, platform)) {
        event.preventDefault();
        onSearch();
      }
    };

    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, [onSearch, platform]);
};
