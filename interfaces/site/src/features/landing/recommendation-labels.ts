import type { Recommendation } from "@merit/recommendations/domain";

export const positionKeys = {
  Fund: "preview.positions.fund",
  "Fund with a condition": "preview.positions.fundWithCondition",
  Defer: "preview.positions.defer",
  Decline: "preview.positions.decline",
} as const satisfies Record<Recommendation["position"] | "Decline", string>;
