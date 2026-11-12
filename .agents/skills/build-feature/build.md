# Build from an approved brief

Implement the feature brief you were given, on the current branch, so that it
matches its precedents closely enough that a reviewer finds nothing to correct.
The brief is your whole specification. You were started without the conversation
that produced it, so a gap in the brief is a question to return, not a choice to
make.

Read [AGENTS.md](../../../AGENTS.md) first. Its guidance applies throughout.

## Stop instead of guessing

**Return a question whenever the brief does not settle something a person would
notice, or the plan cannot be followed as written.** The session that started you
resolves it with the requester; a guess becomes a defect they find later.

Stop for:

- a state, message, permission, saved outcome, or interface effect the brief does
  not decide;
- a precedent that does not fit, so the change needs a component, layer,
  abstraction, or dependency the **Plan** does not name;
- a conflict between the brief and a guide.

Decide yourself what the guides and precedents decide: names, file-internal
structure, and test arrangement. Return each question with the decision needed,
the options, your recommendation, and what is finished so far. Leave the work
uncommitted but in place.

## Build

1. Read every precedent in the brief in full before writing code: the files, their
   stories, their tests, and any local README or MDX.
2. Copy the precedent's structure, then change only what the feature requires.
   Place each change in its owning layer, as described in
   [web features](../../../docs/guides/web-features.md#choose-the-owning-layer) and
   the [architecture](../../../docs/foundations/architecture.md#model-grant-work-explicitly).
3. Search for an existing component, pattern, hook, helper, or fixture before
   writing one. If one nearly fits, extend it rather than making a local copy.
4. Write tests at the layer that owns each rule, following
   [testing](../../../docs/guides/testing.md#choose-the-owning-layer), shaped like
   the precedent's tests. Each rule under **Behavior** needs a test that would fail
   if the rule broke.
5. Run the checks under **Verification** and those the
   [verification guide](../../../docs/guides/verification.md#verification) selects.

## Compare the UI

For UI changes, follow [UI verification](../../../docs/guides/ui-verification.md#verification).
Screenshot the new UI and its precedent in the same states, at the same viewport
and theme, at desktop and narrow widths, into the directory you were given. With
Storybook running (`vp run storybook`):

```sh
pnpm --filter @merit/test-support exec playwright screenshot --viewport-size=1280,800 \
  "http://localhost:6006/iframe.html?id=<story-id>&viewMode=story" <dir>/<name>-desktop.png
```

Look at each pair and correct every difference the brief does not explain before
reporting. Screenshots you did not inspect do not count as verification.

## Report

When the brief is implemented, commit following the
[commit conventions](../../../docs/guides/development.md#commit-changes) and
report:

- the commits;
- each check run and its result;
- the screenshot pairs, by path and state;
- anything in the brief you could not implement or verify, and why.
