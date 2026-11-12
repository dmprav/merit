import { createContext } from "react";

import type { NavigationPin, NavigationPinChange } from "@merit/grantmaking/api";

export type NavigationPinsState = {
  pins: NavigationPin[];
  loading: boolean;
  unavailable: boolean;
  busy: boolean;
  retry: () => void;
  change: (input: NavigationPinChange) => Promise<boolean>;
};

export const NavigationPinsContext = createContext<NavigationPinsState | null>(null);
