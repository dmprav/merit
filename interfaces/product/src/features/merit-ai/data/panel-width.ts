import type { PanelWidthStorage } from "../contracts";

const widthKey = "merit.meritAiPanelWidth";

/** The panel's width, kept per browser. Reading or writing can fail where storage is blocked. */
export const panelWidthStorage: PanelWidthStorage = {
  read: () => {
    try {
      const width = Number(window.localStorage.getItem(widthKey));
      return Number.isFinite(width) && width > 0 ? width : undefined;
    } catch {
      return undefined;
    }
  },
  save: (width) => {
    try {
      window.localStorage.setItem(widthKey, String(width));
    } catch {
      // Without storage the panel keeps this visit's width and starts at the default next time.
    }
  },
};
