/** The computed styles that can paint a focus indicator on one element or pseudo-element. */
export type ElementStyleSnapshot = {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  boxShadow: string;
  borderTopColor: string;
  borderRightColor: string;
  borderBottomColor: string;
  borderLeftColor: string;
  borderTopWidth: string;
  borderRightWidth: string;
  borderBottomWidth: string;
  borderLeftWidth: string;
  backgroundColor: string;
  backgroundImage: string;
  textDecorationLine: string;
  textDecorationThickness: string;
  /** Captured for `::before` and `::after` only. */
  content?: string;
  /** Captured for `::before` and `::after` only. */
  opacity?: string;
};

export type RelativeSnapshot = {
  nodeId: number;
  hasArea: boolean;
  /** The decoration color when the relative has a laid-out text run of its own. */
  decorationColor?: string | undefined;
  painted: boolean;
  style: ElementStyleSnapshot;
};

export type FocusVisualSnapshot = {
  self: ElementStyleSnapshot;
  before?: ElementStyleSnapshot;
  after?: ElementStyleSnapshot;
  ancestors: RelativeSnapshot[];
  descendants: RelativeSnapshot[];
};

/** A pseudo-element paints only with content and nonzero opacity, so its rules differ. */
export type SnapshotKind = "element" | "pseudo";

const isTransparentColor = (color: string): boolean => {
  const normalized = color.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "transparent" ||
    /^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/.test(normalized) ||
    /^(?:rgba?|hsla?)\([^,)]+,[^,)]+,[^,)]+,(?:0+(?:\.0+)?|\.0+)%?\)$/.test(normalized) ||
    /^[a-z][a-z0-9-]*\([^)]+\/(?:0+(?:\.0+)?|\.0+)%?\)$/.test(normalized)
  );
};

const splitTopLevelCommas = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      parts.push(trimmed);
    }
    current = "";
  };

  for (const ch of value) {
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    }
    current += ch;
  }
  flush();
  return parts;
};

const SHADOW_COLOR_PATTERN = /\b[a-z][a-z0-9-]*\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b/gi;

const isShadowLayerVisible = (layer: string): boolean => {
  const colorTokens = [...layer.matchAll(SHADOW_COLOR_PATTERN)].map((match) => match[0]);
  if (colorTokens.length > 0 && colorTokens.every(isTransparentColor)) {
    return false;
  }
  // A layer without offset, blur, or positive spread paints nothing outside (or inside, for
  // inset) the border box, whatever its color.
  const [offsetX = 0, offsetY = 0, blur = 0, spread = 0] = layer
    .replace(SHADOW_COLOR_PATTERN, " ")
    .split(/\s+/)
    .map((token) => Number.parseFloat(token))
    .filter((value) => Number.isFinite(value));
  return offsetX !== 0 || offsetY !== 0 || blur > 0 || spread > 0;
};

/** The shadow's layers that paint something, in order. */
const paintedShadowLayers = (boxShadow: string): string[] => {
  const trimmed = boxShadow.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return [];
  }
  return splitTopLevelCommas(trimmed).filter(isShadowLayerVisible);
};

const hasVisibleBoxShadow = (boxShadow: string): boolean =>
  paintedShadowLayers(boxShadow).length > 0;

const hasVisibleOutline = (style: ElementStyleSnapshot): boolean =>
  style.outlineStyle !== "none" &&
  style.outlineStyle !== "" &&
  Number.parseFloat(style.outlineWidth) > 0 &&
  !isTransparentColor(style.outlineColor);

const BORDER_SIDES = ["Top", "Right", "Bottom", "Left"] as const;

type BorderSide = (typeof BORDER_SIDES)[number];

const borderSidePaints = (style: ElementStyleSnapshot, side: BorderSide): boolean =>
  Number.parseFloat(style[`border${side}Width`]) > 0 &&
  !isTransparentColor(style[`border${side}Color`]);

const hasVisibleBorder = (style: ElementStyleSnapshot): boolean =>
  BORDER_SIDES.some((side) => borderSidePaints(style, side));

const backgroundColorPaints = (style: ElementStyleSnapshot): boolean =>
  style.backgroundColor.trim() !== "" && !isTransparentColor(style.backgroundColor);

const backgroundImagePaints = (style: ElementStyleSnapshot): boolean =>
  style.backgroundImage.trim() !== "" && style.backgroundImage.trim().toLowerCase() !== "none";

const hasVisibleBackground = (style: ElementStyleSnapshot): boolean =>
  backgroundColorPaints(style) || backgroundImagePaints(style);

const hasVisibleOpacity = (opacity: string | undefined): boolean => {
  if (opacity === undefined || opacity === "") {
    return true;
  }
  const parsed = Number.parseFloat(opacity);
  return Number.isFinite(parsed) && parsed > 0;
};

const hasVisibleBoxPaint = (style: ElementStyleSnapshot): boolean =>
  hasVisibleOutline(style) ||
  hasVisibleBoxShadow(style.boxShadow) ||
  hasVisibleBorder(style) ||
  hasVisibleBackground(style);

/** A rule that decides whether one kind of focus cue appeared or changed visibly. */
type FocusCueRule = {
  cue: string;
  changed: (
    unfocused: ElementStyleSnapshot,
    focused: ElementStyleSnapshot,
    kind: SnapshotKind,
  ) => boolean;
};

const outlineChanged: FocusCueRule["changed"] = (unfocused, focused) =>
  hasVisibleOutline(focused) &&
  (unfocused.outlineStyle !== focused.outlineStyle ||
    unfocused.outlineWidth !== focused.outlineWidth ||
    unfocused.outlineColor !== focused.outlineColor ||
    unfocused.outlineOffset !== focused.outlineOffset);

// Only layers that paint can show a change; a transparent layer can change without drawing anything.
const boxShadowChanged: FocusCueRule["changed"] = (unfocused, focused) => {
  const focusedLayers = paintedShadowLayers(focused.boxShadow);
  return (
    focusedLayers.length > 0 &&
    focusedLayers.join(", ") !== paintedShadowLayers(unfocused.boxShadow).join(", ")
  );
};

// A side's change shows only when that side paints before or after it; a zero-width or
// transparent border can change color without drawing anything.
const borderChanged: FocusCueRule["changed"] = (unfocused, focused, kind) =>
  BORDER_SIDES.some(
    (side) =>
      (unfocused[`border${side}Color`] !== focused[`border${side}Color`] ||
        unfocused[`border${side}Width`] !== focused[`border${side}Width`]) &&
      (borderSidePaints(unfocused, side) || borderSidePaints(focused, side)),
  ) &&
  (kind === "element" || hasVisibleBorder(focused));

// Like a border side, a color or image change shows only when it paints before or after focus;
// two transparent colors differ as strings without drawing anything.
const backgroundChanged: FocusCueRule["changed"] = (unfocused, focused, kind) =>
  ((unfocused.backgroundColor !== focused.backgroundColor &&
    (backgroundColorPaints(unfocused) || backgroundColorPaints(focused))) ||
    (unfocused.backgroundImage !== focused.backgroundImage &&
      (backgroundImagePaints(unfocused) || backgroundImagePaints(focused)))) &&
  (kind === "element" || hasVisibleBackground(focused));

// A thickness change paints nothing unless a decoration line is drawn.
const textDecorationChanged: FocusCueRule["changed"] = (unfocused, focused) =>
  unfocused.textDecorationLine !== focused.textDecorationLine ||
  (unfocused.textDecorationThickness !== focused.textDecorationThickness &&
    focused.textDecorationLine !== "none");

// A pseudo-element that starts painting, or whose content or opacity changes while it paints,
// is an indicator even when none of its other styles change.
const pseudoIndicatorChanged: FocusCueRule["changed"] = (unfocused, focused, kind) =>
  kind === "pseudo" &&
  focused.content !== undefined &&
  focused.content !== "none" &&
  (focused.content !== unfocused.content || focused.opacity !== unfocused.opacity) &&
  hasVisibleOpacity(focused.opacity) &&
  hasVisibleBoxPaint(focused);

/** Checked in this order, which is the order a snapshot's reasons are reported in. */
const FOCUS_CUE_RULES: readonly FocusCueRule[] = [
  { cue: "outline", changed: outlineChanged },
  { cue: "box-shadow", changed: boxShadowChanged },
  { cue: "border", changed: borderChanged },
  { cue: "background", changed: backgroundChanged },
  { cue: "text-decoration", changed: textDecorationChanged },
  { cue: "pseudo-indicator", changed: pseudoIndicatorChanged },
];

/** A focused pseudo-element without content or opacity paints nothing, whatever its styles. */
const pseudoPaintsNothing = (focused: ElementStyleSnapshot): boolean =>
  focused.content === "none" || !hasVisibleOpacity(focused.opacity);

/** Names each visible focus cue between two snapshots of one element as `scope:cue`. */
export const compareStyleSnapshots = (
  unfocused: ElementStyleSnapshot,
  focused: ElementStyleSnapshot,
  { scope, kind }: { scope: string; kind: SnapshotKind },
): string[] => {
  if (kind === "pseudo" && pseudoPaintsNothing(focused)) {
    return [];
  }
  return FOCUS_CUE_RULES.filter((rule) => rule.changed(unfocused, focused, kind)).map(
    (rule) => `${scope}:${rule.cue}`,
  );
};

const compareRelatives = (
  unfocused: readonly RelativeSnapshot[],
  focused: readonly RelativeSnapshot[],
  relation: "ancestor" | "descendant",
): string[] => {
  const baselines = new Map(unfocused.map((sample) => [sample.nodeId, sample]));
  return focused.flatMap((after, index) => {
    const before = baselines.get(after.nodeId);
    if (!before || (!before.painted && !after.painted)) {
      return [];
    }
    const scope = `${relation}[${index}]`;
    if (before.painted !== after.painted) {
      const visible = after.painted ? after : before;
      const decorated =
        visible.decorationColor !== undefined && !isTransparentColor(visible.decorationColor);
      return visible.hasArea && (hasVisibleBoxPaint(visible.style) || decorated)
        ? [`${scope}:visibility`]
        : [];
    }
    return compareStyleSnapshots(before.style, after.style, { scope, kind: "element" });
  });
};

const comparePseudo = (
  unfocused: ElementStyleSnapshot | undefined,
  focused: ElementStyleSnapshot | undefined,
  scope: string,
): string[] =>
  unfocused && focused ? compareStyleSnapshots(unfocused, focused, { scope, kind: "pseudo" }) : [];

export const detectFocusVisualChange = (
  unfocused: FocusVisualSnapshot,
  focused: FocusVisualSnapshot,
): { changed: boolean; reasons: string[] } => {
  const reasons = [
    ...compareStyleSnapshots(unfocused.self, focused.self, { scope: "self", kind: "element" }),
    ...comparePseudo(unfocused.before, focused.before, "self::before"),
    ...comparePseudo(unfocused.after, focused.after, "self::after"),
    ...compareRelatives(unfocused.ancestors, focused.ancestors, "ancestor"),
    ...compareRelatives(unfocused.descendants, focused.descendants, "descendant"),
  ];
  return { changed: reasons.length > 0, reasons };
};
