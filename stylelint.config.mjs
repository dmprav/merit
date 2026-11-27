// Feature styles arrange their own content; type, color, and surfaces come from @merit/ui.
const featureStyles = [
  "app/src/**/*.module.css",
  "capabilities/**/*.module.css",
  "interfaces/{product,admin}/**/*.module.css",
];
// Storybook examples and development-only tools arrange demonstrations rather than product UI.
// Third-party components styled through their appearance APIs keep those classes in
// *.clerk.module.css (or a similarly named file for another provider).
const featureStyleExceptions = [
  "**/*.stories.module.css",
  "app/src/development/**",
  "**/*.clerk.module.css",
];

const typography = [
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "color",
  "text-transform",
  "/^text-decoration/",
];
const surfaces = [
  "background",
  "background-color",
  "box-shadow",
  "border-radius",
  "/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-(color|style|width))?$/",
];

// One value: a word, or a function call with one level of nested parentheses.
const token = String.raw`(?:[^\s()]*\((?:[^()]|\([^()]*\))*\)|[^\s()]+)`;
const negative = String.raw`(?:-[\d.]|calc\((?:\s*-|\s*0(?:px)?\s*-|(?:[^()]|\([^()]*\))*\*\s*-[\d.]))`;

/** Matches a value whose token at the given position is negative, such as `-8px` or `calc(0px - var(--x))`. */
const negativeValue = (position) =>
  new RegExp(String.raw`^(?:${token}\s+){${position}}${negative}`);

/** A single negative value, which a shorthand applies to every side. */
const negativeEverywhere = new RegExp(String.raw`^(?=${negative})${token}$`);

// Shared UI spacing is written with --space-* tokens; a length literal is a value tokens.css lacks.
// A 1px or half-pixel hairline stays literal.
// A local custom property named for spacing, such as `--page-gutter`, is held to the same rule.
const uiSpacing =
  "/^((padding|margin|inset|gap|row-gap|column-gap|top|right|bottom|left)(-(top|right|bottom|left|block|inline)(-(start|end))?)?|--[a-z-]*(gap|gutter|inset|outdent|spacing|padding|margin))$/";
const literalLength = /(?<![\w.])(?!(?:1|0?\.5)px\b)(?:\d*\.\d+|[1-9]\d*)(?:px|rem|em|ch|pt)\b/;
const literalTime = /(?<![\w.])\d*\.?\d+m?s\b/;
const uiRadius =
  "/^(border((-(top|bottom))?-(left|right|start|end))?(-(start|end))?-radius|--[a-z-]*-radius)$/";
// Any local custom property is held to this: a time literal in one is only ever a duration.
const uiTime = "/^((transition|animation)(-duration|-delay)?|--[a-z-]+)$/";
// A radius token, or one inset from it so a nested surface stays concentric.
const radiusValue =
  /^(?:(?:var\(--[a-z]+-radius\)|calc\(var\(--[a-z]+-radius\) - \d+px\)|0|50%|999px)(?:\s+|$))+$/;
// A --z-* layer, or a component's own custom property that falls back to one.
const layerValue = /^(?:var\(--z-[a-z-]+\)|var\(--[a-z-]+, var\(--z-[a-z-]+\)\)|[012])$/;

/** @type {import("stylelint").Config} */
export default {
  plugins: ["./tooling/stylelint/icon-size.mjs"],
  ignoreFiles: [
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-ssr/**",
    "**/.react-email/**",
    "**/coverage/**",
  ],
  rules: {
    "at-rule-no-unknown": true,
    "block-no-empty": true,
    "color-no-invalid-hex": true,
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-values"] },
    ],
    "declaration-block-no-duplicate-custom-properties": true,
    "declaration-block-no-shorthand-property-overrides": true,
    "font-family-no-duplicate-names": true,
    "function-no-unknown": true,
    "keyframe-block-no-duplicate-selectors": true,
    "media-feature-name-no-unknown": true,
    "no-duplicate-selectors": true,
    "property-no-unknown": true,
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global", "local"] }],
    "selector-pseudo-element-no-unknown": true,
    "unit-no-unknown": true,
    "rule-empty-line-before": ["always", { except: ["first-nested"], ignore: ["after-comment"] }],
    "at-rule-empty-line-before": [
      "always",
      {
        except: ["first-nested"],
        ignore: ["after-comment", "blockless-after-same-name-blockless"],
      },
    ],
    // Weights come from the three-step scale in tokens.css, so emphasis stays consistent.
    "declaration-property-value-allowed-list": [
      { "font-weight": ["/^var\\(--weight-[a-z]+\\)$/", "inherit"] },
      { message: () => 'Use a "--weight-*" token for font-weight' },
    ],
    // Colors come from semantic tokens; color-mix() may derive shades from them.
    "color-no-hex": true,
    "color-named": "never",
    "function-disallowed-list": [
      "color",
      "rgb",
      "rgba",
      "hsl",
      "hsla",
      "hwb",
      "lab",
      "lch",
      "oklab",
      "oklch",
    ],
  },
  overrides: [
    {
      files: featureStyles,
      rules: {
        "property-disallowed-list": [
          [...typography, ...surfaces],
          { message: (property) => `Use @merit/ui components for "${property}" in feature styles` },
        ],
        // An outdent that lines text up with an edge belongs to a shared component's alignment option.
        "declaration-property-value-disallowed-list": [
          {
            "/^margin-(inline(-(start|end))?|left|right)$/": [negativeValue(0), negativeValue(1)],
            // The shorthand's second and fourth values are its inline sides.
            "/^margin$/": [negativeEverywhere, negativeValue(1), negativeValue(3)],
          },
          { message: () => "Use a shared alignment option instead of a negative inline margin" },
        ],
        // Shared components own their states and internals; features select their own elements.
        "selector-disallowed-list": [
          [
            /\[data-(variant|tone|appearance|size|density|alignment|align|justify|hovered|pressed|focus-visible)/,
            /(^|[\s>+~(])(button|svg|label|input|textarea|header|a)(?![\w-])/,
          ],
          { splitList: true },
        ],
      },
    },
    {
      // Examples, development tools, and third-party appearance classes keep the base rules but
      // may style what the feature-specific bans would otherwise reserve for @merit/ui.
      files: featureStyleExceptions,
      rules: {
        "property-disallowed-list": null,
        "declaration-property-value-disallowed-list": null,
        "selector-disallowed-list": null,
      },
    },
    {
      // Shared components take spacing, corners, motion, and layers from tokens.css so a value
      // changes in one place. Zero, auto, percentages, and 1px hairlines need no token.
      // A popover takes its surface from foundations/popover.module.css instead of restyling it.
      // The surface itself, the toast, and the search palette box (not popovers) say why they
      // borrow the shadow with a scoped disable.
      files: ["foundation/ui/src/**/*.css"],
      rules: {
        "merit/icon-size": true,
        "declaration-property-value-disallowed-list": [
          {
            "box-shadow": [/--popover-shadow/],
            [uiSpacing]: [literalLength],
            [uiTime]: [literalTime],
          },
          {
            message: (property) =>
              property === "box-shadow"
                ? "Use the shared popover surface from foundations/popover.module.css"
                : /^(transition|animation)/.test(String(property))
                  ? `Use a "--motion-*" token from tokens.css for "${property}"`
                  : String(property).startsWith("--")
                    ? `Use a "--space-*" or "--motion-*" token from tokens.css for "${property}"`
                    : `Use a "--space-*" token from tokens.css for "${property}"`,
          },
        ],
        "declaration-property-value-allowed-list": [
          {
            "font-weight": ["/^var\\(--weight-[a-z]+\\)$/", "inherit"],
            [uiRadius]: [radiusValue],
            "z-index": [layerValue],
          },
          {
            message: (property) =>
              property === "font-weight"
                ? 'Use a "--weight-*" token for font-weight'
                : property === "z-index"
                  ? 'Use a "--z-*" token for z-index (0, 1, or 2 for local stacking)'
                  : 'Use a "--*-radius" token for corners (0, 50%, or 999px stay)',
          },
        ],
      },
    },
    {
      // Examples demonstrate with whatever values they need, and tokens.css defines the values.
      files: [
        "foundation/ui/src/**/*.stories.module.css",
        "foundation/ui/src/foundations/tokens.css",
      ],
      rules: {
        "merit/icon-size": null,
        "declaration-property-value-disallowed-list": [
          { "box-shadow": [/--popover-shadow/] },
          { message: "Use the shared popover surface from foundations/popover.module.css" },
        ],
        "declaration-property-value-allowed-list": [
          { "font-weight": ["/^var\\(--weight-[a-z]+\\)$/", "inherit"] },
          { message: () => 'Use a "--weight-*" token for font-weight' },
        ],
      },
    },
    {
      files: ["foundation/ui/src/foundations/tokens.css"],
      rules: { "color-no-hex": null, "color-named": null, "function-disallowed-list": null },
    },
  ],
};
