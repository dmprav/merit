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
   writing one; for UI, list and read the
   [Storybook documentation](../../../docs/guides/ui.md#compose-and-style-a-feature).
   If one nearly fits, extend it rather than making a local copy.
   For schema changes, follow the
   [database schema guide](../../../docs/guides/database.md), import shared
   builders from `@merit/db/schema`, and generate and check migrations per
   [local development](../../../docs/guides/development.md#schema-changes).
4. Write tests at the layer that owns each rule, following
   [testing](../../../docs/guides/testing.md#choose-the-owning-layer), shaped like
   the precedent's tests. Each rule under **Behavior** needs a test that would fail
   if the rule broke.
5. Run the checks under **Verification** and those the
   [verification guide](../../../docs/guides/verification.md#verification) selects.

## Compare the UI

For UI changes, follow [UI verification](../../../docs/guides/ui-verification.md#verification)
and [drive-merit](../drive-merit/SKILL.md). Capture the new UI and its precedent in the same
states across desktop (`1440x1000`) and mobile (`390x844`) into the directory you were given
with `vp run ui:verify` (which manages isolated Storybook or app servers, axe/overflow/error
checks, keyboard focus traversal, and proof artifacts). For interaction-dependent states
(open menus, dialogs, validation, editing), capture Storybook stories whose `play()` function
renders that state or drive the flow interactively via `drive-merit` rather than relying on
idle initial renders:

```sh
vp run ui:verify --story <story-id>,<precedent-story-id> --out <dir>
# Or verify a changed route and its precedent in the same app mode:
vp run ui:verify --route <changed-route>,<precedent-route> --out <dir>
# When routes use different modes (demo vs workspace), capture each into its own --out dir:
vp run ui:verify --route <changed-route> --out <dir>/changed
vp run ui:verify --route <precedent-route> --out <dir>/precedent
```

Inspect `<dir>/report.md` and every captured pair under `<dir>/screenshots/`, and correct
every difference the brief does not explain before reporting. Screenshots you did not inspect
do not count as verification.

## Report

When the brief is implemented, commit following the
[commit conventions](../../../docs/guides/development.md#commit-changes) and
report:

- the commits;
- each check run and its result;
- the screenshot pairs, by path and state;
- anything in the brief you could not implement or verify, and why.
