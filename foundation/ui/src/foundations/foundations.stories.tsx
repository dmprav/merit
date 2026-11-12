import type { Meta, StoryObj } from "@storybook/react-vite";

import localStyles from "./foundations.stories.module.css";

const swatches = [
  { name: "Background", token: "background" },
  { name: "Surface", token: "surface" },
  { name: "Muted surface", token: "surface-muted" },
  { name: "Action", token: "action", foreground: "on-action" },
  { name: "Selection", token: "action-subtle", foreground: "action" },
  { name: "Success", token: "success-subtle", foreground: "success" },
  { name: "Warning", token: "warning-subtle", foreground: "warning" },
  { name: "Danger", token: "danger-subtle", foreground: "danger" },
  { name: "Foreground", token: "foreground" },
  { name: "Secondary text", token: "muted" },
  { name: "Focus", token: "focus" },
  {
    name: "Control border",
    token: "border-control",
  },
];

const meta = {
  title: "Foundations/Tokens",
  tags: ["!autodocs"],
  render: () => <FoundationPreview />,
} satisfies Meta;

export default meta;

export const Overview: StoryObj<typeof meta> = {};

const FoundationPreview = () => {
  return (
    <section
      id="foundations"
      aria-labelledby="foundations-title"
      className={localStyles.foundations}
    >
      <div>
        <h2 id="foundations-title" className={localStyles.title}>
          Foundations
        </h2>
        <p className={localStyles.introduction}>
          Quiet surfaces, clear hierarchy, and color with a consistent purpose.
        </p>
      </div>
      <div className={localStyles.surface}>
        <h3 className={localStyles.sectionTitle}>Semantic colors</h3>
        <div className={localStyles.swatches}>
          {swatches.map((swatch) => (
            <div key={swatch.token}>
              <div
                aria-hidden="true"
                className={localStyles.swatch}
                style={{
                  background: `var(--${swatch.token})`,
                  color: swatch.foreground ? `var(--${swatch.foreground})` : undefined,
                }}
              >
                {swatch.foreground ? swatch.name : null}
              </div>
              <p className={localStyles.swatchTitle}>{swatch.name}</p>
              <div className={localStyles.colorTokens}>
                {swatch.foreground ? <code>{swatch.foreground}</code> : null}
                <code>{swatch.token}</code>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={localStyles.panels}>
        <div className={localStyles.surface}>
          <h3 className={localStyles.panelTitle}>Typography</h3>
          <div className={localStyles.textExamples}>
            <p className={localStyles.display}>Round title</p>
            <p className={localStyles.title}>Section heading</p>
            <p className={localStyles.body}>Body text explains the work clearly.</p>
            <p className={localStyles.reading}>
              Reading text gives submissions, assessments, and reasoning more room, while nearby
              controls and reference details stay compact.
            </p>
            <p className={localStyles.caption}>Supporting details stay readable.</p>
            <p className={localStyles.metric}>€60,000</p>
          </div>
        </div>
        <div className={localStyles.surface}>
          <h3 className={localStyles.panelTitle}>Spacing & shape</h3>
          <p className={localStyles.description}>
            Use the 4 px spacing scale. Controls have a 6 px radius; panels use 10 px. Keep shadows
            for overlays.
          </p>
          <div
            className={localStyles.spacing}
            aria-label="Spacing examples: 4, 8, 16, 24, and 32 pixels"
          >
            {[
              { label: "4" },
              { label: "8" },
              { label: "16" },
              { label: "24" },
              { label: "32" },
            ].map((space) => (
              <div key={space.label} className={localStyles.spacingExample}>
                <div className={localStyles.spacingBar} style={{ width: `${space.label}px` }} />
                <span className={localStyles.caption}>{space.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
