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
const negative = String.raw`(?:-[\d.]|calc\(\s*(?:-|0(?:px)?\s*-))`;

/** Matches a value whose token at the given position is negative, such as `-8px` or `calc(0px - var(--x))`. */
const negativeValue = (position) =>
  new RegExp(String.raw`^(?:${token}\s+){${position}}${negative}`);

/** @type {import("stylelint").Config} */
export default {
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
      ignoreFiles: featureStyleExceptions,
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
            "/^margin$/": [negativeValue(1), negativeValue(3)],
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
      files: ["foundation/ui/src/foundations/tokens.css"],
      rules: { "color-no-hex": null, "color-named": null, "function-disallowed-list": null },
    },
  ],
};
