# Verify interface changes

Check the interaction in its surrounding task as well as in isolation.
[UI development](ui.md) covers composition; [Storybook](storybook.md) explains
how to prepare examples; [workspace verification](verification.md) lists the
checks for the rest of the application.

## Verification

Use Storybook's accessibility panel and viewport controls alongside keyboard and
touch and small-screen checks. Check focus, validation, pending states, text zoom,
reduced motion, and high-contrast preferences. Then complete the task in the
application, including navigation into and out of the feature, to verify context,
scrolling, and unfinished work. For browser-dependent changes, follow
[browser compatibility verification](verification.md#browser-compatibility);
for changes to loading or responsiveness, use
[performance verification](verification.md#performance-verification).

For new or substantially changed UI, identify the closest established component
or pattern and compare their rendered states at the same viewport and theme.
Check hierarchy, typography, density, framing, alignment, and selection and focus
treatments. Explain differences through the person's task; shared tokens alone
do not establish consistency. Record the reference story or screen and any
intentional differences in the change's [verification record](verification.md#record-verification). When no suitable
pattern exists, use the relevant foundations to assess the new shared pattern.

Inspect the states where the interaction happens: open menus and dialogs,
selected and focused choices, editing, and feedback. Include long and missing
content and narrow screens where relevant. Correct awkward layouts, redundant
controls, and unclear labels alongside interaction failures before considering
the change complete.

Read action labels together with their heading, fields, and nearby explanation.
Remove repetition while keeping consequences clear before commitment. Check the
action group at narrow widths, including pending labels. Preserve useful context
in accessible names for repeated or icon-only controls, and when compacting a
header keep its primary next action visibly labeled and full destination context
reachable via keyboard and touch without duplicate navigation.

Check that navigation popups close on browser history changes, delayed saves
preserve focus when the person has moved elsewhere, and disappearing controls
move focus cleanly to a remaining target regardless of menu or popup teardown
order. Verify that invitation, withdrawn, access-ended, and recovery states each
present one clear outcome heading, a distinct preserved draft when needed, and
one action hierarchy across desktop and narrow screens.

Check that someone can complete the task and understand its consequences without
opening optional help. Verify that supporting explanations are discoverable with
keyboard and touch, that help links reach the relevant topic, and that consulting
help preserves unfinished work.

Choose checks for the behavior you changed:

| Change                                                  | Check                                               |
| ------------------------------------------------------- | --------------------------------------------------- |
| Shared controls                                         | `vp run @merit/ui#test`                             |
| Grantmaking components and controllers                  | `vp run @merit/grantmaking-web#test --project ui`   |
| Rounds components and controllers                       | `vp run @merit/rounds-web#test`                     |
| Applications components and controllers                 | `vp run @merit/applications-web#test`               |
| Reviews components and controllers                      | `vp run @merit/reviews-web#test`                    |
| Recommendations components and controllers              | `vp run @merit/recommendations-web#test`            |
| Contact components and controllers                      | `vp run @merit/contacts-web#test --project ui`      |
| Team components and controllers                         | `vp run @merit/organizations-web#test --project ui` |
| Product routes and connected feature composition        | `vp run @merit/product#test --project ui`           |
| Organization administration behavior                    | `vp run @merit/admin#test`                          |
| Shared table behavior                                   | `vp run @merit/tables#test`                         |
| Shared form behavior                                    | `vp run @merit/forms#test`                          |
| Story rendering, interaction, accessibility             | `vp run test:stories`                               |
| Story tests while editing                               | `vp run test:stories:watch`                         |
| Storybook layout, docs, and visual regression           | `vp run test:browser:stories`                       |
| Application navigation and browser behavior             | `vp run test:browser:app`                           |
| Shared browser checks, Storybook, and application flows | `vp run test:browser`                               |
| Deterministic UI sweep, a11y, focus, and screenshots    | `vp run ui:verify`                                  |
| Storybook configuration or packaging                    | `vp run @merit/storybook#build`                     |

Run the suite belonging to the changed code. Capability component tests and
product integration tests cover different boundaries; the product command does
not run capability suites. Omit `--project ui` when pure controllers, command
builders, or data logic also changed, so the package's unit tests run too.

Query visible behavior by role, label, and text. Story tests discover every story
and run its rendering, `play` assertions, and accessibility checks in Chromium.
The test addon also exposes results and reruns inside Storybook. Use
`vp run test:stories button.stories.tsx` to focus on a component.

Component tests cover the larger matrix of data and failure cases. Keep story
assertions focused on the demonstrated state. Put geometry, scrolling, theme, and
viewport checks in [the Storybook browser suite](../../tooling/storybook/tests/browser);
put navigation and complete tasks in [the application suite](../../app/tests/browser/application.spec.ts).
Each browser suite starts only its own server. Component tests run with Clerk
disabled, so check live sign-in in the application when affected.

Browser commands default to desktop Chromium for targeted checks. Include other
supported browsers when the changed behavior requires them, following
[browser compatibility verification](verification.md#browser-compatibility).
Use the `:all` variants at the [full verification milestones](verification.md#verification);
`vp run ready` includes that full matrix. For example,
`vp run test:browser:stories:all` checks Storybook across all five projects.

The Storybook browser suite uses four workers. Use
`vp run test:browser:stories --workers 2` when other work needs the CPU.
It runs against the static Storybook build rather than a development server, so
the first story in each worker does not wait for modules to be transformed on demand.
Its server first runs the cached `@merit/storybook#build`, which rebuilds only
when stories, components, or configuration change, then serves `dist/` with
`vp preview`. The build keeps React's development checks, so the suite still
reports their warnings as browser errors. Use `vp run storybook` for live editing.

Install the browsers once with `pnpm --filter @merit/test-support exec playwright install chromium firefox webkit`
before running browser checks. Storybook browser artifacts are in `merit-storybook-results` and
application artifacts in per-run `merit-demo-browser-*` and `merit-workspace-browser-*`
directories under the operating system's temporary directory.
The [Storybook configuration](../../tooling/storybook/playwright.config.ts)
and [application configuration](../../app/tests/browser/playwright.config.ts) use the
shared [browser projects](verification.md#browser-compatibility). Chromium runs the
full suites and visual baselines; the `:all` commands also run representative
`@cross-browser` checks in Firefox and desktop and mobile WebKit. Story test-addon
runs remain in Chromium.

### Deterministic CLI verification (`ui:verify`)

For repeatable screenshot, accessibility, overflow, error, and keyboard focus checks on
Storybook stories or live routes without managing servers manually, run `vp run ui:verify`
(see the [drive-merit skill](../../.agents/skills/drive-merit/SKILL.md) for user-POV feature
maps and persona workflows):

```sh
# Curated Storybook sweep (desktop 1440x1000 + mobile 390x844, Postgres-free)
vp run ui:verify

# Targeted stories (substring or glob, e.g. components-button*)
vp run ui:verify --story components-button--overview,patterns-form-dialog--with-context

# Live app routes (isolated ephemeral database + app server; one mode per run).
# Start PostgreSQL first so the run can create its ephemeral database.
vp run services:start
vp run ui:verify --route /demo --viewport both --json
vp run ui:verify --route /app/alder/rounds --viewport both --json
```

Every host run (without `--container`) starts isolated servers on ephemeral ports, checks zero
WCAG 2 A/AA/2.1AA violations, zero horizontal overflow, zero console/page errors, and visible
keyboard `Tab` focus changes (each stop must be painted, with no `opacity: 0` on it or an
ancestor, and must differ from the page with nothing focused and with the next stop focused,
so a stop removed from the document as focus leaves it fails;
focus that enters a cross-origin frame or navigates to a new document fails as incomplete), then writes deterministic proof artifacts to `.tmp/ui-verify/`
(override with `--out <dir>`): `report.md`, Zod-validated `results.json`, and
`screenshots/*.png`. A route that redirects, such as to sign-in, is checked where it lands:
`results.json` records that page as `url` beside the requested `requestedUrl`, and `report.md` shows it after the requested route, in full when it is on another origin.
When a target fails before its checks run, such as on an HTTP error, `results.json` records the
`error` and `report.md` marks its axe, overflow, and focus checks as not checked.
Servers and ephemeral databases are torn down automatically on exit or
failure. Pass `--update` on host runs to delete the selected targets' previous screenshots for
the selected viewports before checking; screenshots of other targets and viewports stay. A run
locks its output directory until its report is written, so a second concurrent run against the
same `--out` fails immediately; give concurrent runs separate `--out` directories. Running with
`--container` (or `--container --update`) delegates pixel-exact comparison to Docker Playwright,
writing only the delegation `report.md` and `results.json` (with `containerExitCode`) under
`--out` rather than host `screenshots/*.png`; Linux visual baselines live in
`tooling/storybook/snapshots/` and container diffs appear in Playwright's container output.

### Review visual changes

The [visual suite](../../tooling/storybook/tests/browser/visual.spec.ts) compares a small set of
focus, dialog, field, table, recommendation, and open workspace-switcher screenshots.
[`visual-targets.ts`](../../tooling/storybook/visual-targets.ts) lists those stories once;
the suite registers a test for each, and `ui:verify` checks the same stories by default.
Add or remove a baseline there. Baselines live in `tooling/storybook/snapshots` and standardize on Linux snapshots
matching the Ubuntu 24.04 PR workflow. Run visual comparisons and baseline updates
inside the pinned Playwright container so macOS and Linux development environments
produce identical pixels:

```sh
vp run ui:verify --container
# Equivalent direct container runner:
vp run test:browser:stories:container
```

To accept an intentional visual change, update the Linux baselines through the container
and rerun the comparison cleanly:

```sh
vp run ui:verify --container --update
vp run ui:verify --container
```

On native Ubuntu 24.04 hosts with the locked browser version installed (`pnpm --filter @merit/test-support exec playwright install --with-deps chromium firefox webkit`), `vp run test:browser:stories:all visual.spec.ts --project desktop --project mobile` also runs directly without Docker. Append `--update-snapshots` only when preparing an intentional baseline update, then rerun without it.

Review a new baseline against the established reference before accepting it;
screenshots detect later changes but cannot judge whether the initial design fits.
Keep the demonstrated state open in its story so people can inspect and try it.
The shell's workspace-switcher stories cover ordinary and long names on desktop
and mobile; interaction tests separately protect navigation and keyboard behavior.

Inspect each changed image before committing it. Never update baselines just to
clear a failure. Keep dates, data, and asynchronous outcomes deterministic; use
explicit assertions for behavior a screenshot cannot establish.

See the [verification guide](verification.md#verification) for workspace-wide checks.
