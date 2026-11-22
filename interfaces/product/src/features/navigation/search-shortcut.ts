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

/** ⌘ plus the key on Apple platforms and Ctrl plus the key elsewhere, without other modifiers. */
const isShortcut = (
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  key: string,
  platform: ShortcutPlatform,
) =>
  platform !== "unknown" &&
  event.key.toLowerCase() === key &&
  !event.altKey &&
  !event.shiftKey &&
  (platform === "apple" ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey);

/** The hint a button shows for its shortcut, such as "⌘ K" or "Ctrl K"; none until the platform is known. */
export const shortcutHint = (platform: ShortcutPlatform, key: string) =>
  platform === "unknown"
    ? undefined
    : `${platform === "apple" ? "⌘" : "Ctrl"} ${key.toUpperCase()}`;

/** The `aria-keyshortcuts` value for the same shortcut, such as "Meta+K" or "Control+K". */
export const shortcutKeys = (platform: ShortcutPlatform, key: string) =>
  platform === "unknown"
    ? undefined
    : `${platform === "apple" ? "Meta" : "Control"}+${key.toUpperCase()}`;

/**
 * Calls `onShortcut` for ⌘ or Ctrl plus the key from anywhere on the page, including while focus is
 * in a text field, and keeps the browser from using it. Pass nothing to leave the shortcut alone.
 */
export const useShortcut = (key: string, onShortcut: (() => void) | undefined) => {
  const platform = useShortcutPlatform();

  useEffect(() => {
    if (!onShortcut) {
      return;
    }

    const listen = (event: KeyboardEvent) => {
      if (isShortcut(event, key, platform)) {
        event.preventDefault();
        onShortcut();
      }
    };

    document.addEventListener("keydown", listen);
    return () => document.removeEventListener("keydown", listen);
  }, [key, onShortcut, platform]);
};

/** Opens search from anywhere on the page with ⌘K or Ctrl+K. */
export const useSearchShortcut = (onSearch: (() => void) | undefined) => useShortcut("k", onSearch);
