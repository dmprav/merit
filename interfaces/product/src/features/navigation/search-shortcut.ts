import { useEffect, useSyncExternalStore } from "react";

type ShortcutPlatform = "apple" | "other" | "unknown";

const noSubscription = () => () => {};

const currentPlatform = (): ShortcutPlatform => {
  const platform =
    (
      navigator as Navigator & { userAgentData?: { platform?: string } }
    ).userAgentData?.platform?.trim() || navigator.platform?.trim();
  const signal = platform || navigator.userAgent;
  if (!signal) {
    return "unknown";
  }
  return /Mac|iPhone|iPad|iPod/i.test(signal) ? "apple" : "other";
};

/** Hide the key hint until browser platform information is available after hydration. */
export const useShortcutPlatform = () =>
  useSyncExternalStore(noSubscription, currentPlatform, () => "unknown" as const);

/** ⌘K on Apple platforms and Ctrl+K elsewhere, without other modifiers. */
const isSearchShortcut = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: ShortcutPlatform,
) =>
  platform !== "unknown" &&
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
