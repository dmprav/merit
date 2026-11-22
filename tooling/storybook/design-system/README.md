# Design-system export

This folder rebuilds Merit's design system from the code, so the published copy can
follow `@merit/ui`, `@merit/forms` and `@merit/tables` as they change. It sits with
Storybook because both present the same shared catalog to readers; Storybook shows
stories, and the export packages tokens, the built library and usage cards for designers
and agents working outside the repository.

## Rebuild it

```sh
vp run @merit/storybook#build:design-system
```

The command writes `design-system/dist/project/`, which is ignored by Git. It holds
the files a design-system artifact keeps under `project/`:

| Output                             | Source                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.json`                      | [tokens.css](../../../foundation/ui/src/foundations/tokens.css), classified by [tokens.meta.json](tokens.meta.json)                         |
| `components/bundle.js`, `lib/*.js` | Every export of the three packages on `window.Merit`, built with the repository's Vite and React compiler; React 19 and ReactDOM as globals |
| `components/bundle.css`            | Properties tokens.json cannot hold, the [reset](../../../foundation/ui/src/foundations/reset.css), document defaults and every CSS Module   |
| `components/index.d.ts`            | Declarations TypeScript emits for the exported modules                                                                                      |
| `components/<Card>/`, `README.md`  | The authored cards and brand book in [content](content)                                                                                     |
| `fonts/*.woff2`, `type.fonts`      | The font files and `@font-face` rules `@merit/ui/styles.css` imports from packages (Instrument Sans)                                        |
| `assets/Icons`, `assets/Logos`     | Icon's Lucide glyphs and Brand's mark, rendered with the shared size, stroke and colors                                                     |

The export has no `tokens.css`: the design-system artifact generates it from `tokens.json`,
so `bundle.css` and the previews rely on that file.

Pass a directory as the first argument to `vpx design-system/build.ts` to write somewhere
else.

## Keep it accurate

**The build fails rather than publish a token it cannot place.** Every custom property in
`tokens.css` needs an entry in `tokens.meta.json`: a token family with a usage note, the
font family, or `css` with the reason it stays in `bundle.css`. A new property, or an entry
for one that was removed, stops the build with its name, and so does a spacing, radius, shadow or size property the
product theme overrides, since those families hold one value. `vp run test:design-system`
covers this contract.

**Cards are authored, so review them when a component's behavior or props change.** Each
card is a `preview.html` that mounts the real component through `window.Merit` and a
`README.md` with its usage rules, written from the module's JSDoc, MDX and stories. Line 1 of
a preview is its `@dsCard` marker, with the Storybook category as its `group` and the
rendered height in pixels. Wrap every preview in `Merit.Provider`, which supplies the shared
messages and en-GB formatting.

## Publish it

Publishing uploads the output to the Merit design-system artifact on claude.ai and is not
part of this command: ask Claude Code to publish `design-system/dist/project` to it. Icons
and the mark go up as assets; the other files replace their published copies, so edits made
on the artifact's page to those files are overwritten.
