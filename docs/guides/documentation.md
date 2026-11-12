# Writing useful documentation

Documentation helps readers act and make informed choices. Organize it around
the questions they bring, with enough context to apply the answer.

## Start with the reader's purpose

Give each document a clear question to answer. Lead with the answer, then explain
what the reader needs to understand or do next. Group related ideas under headings
that make those answers easy to find.

Choose detail by its value to that task. Foundations explain direction and design;
workflows explain behavior; practical guides include prerequisites, commands,
expected results, and ways to continue when something needs attention. Link to
code and configuration for implementation details readers can verify there.

## Write guidance that carries forward

State the desired property, why it matters, and how it guides a choice. A useful
principle helps a contributor reason about a new situation. Examples make that
principle concrete; sources support claims and establish where they apply.

Give each principle a descriptive heading and a short, bold opening statement
that can guide a decision on its own. Use the following prose for reasoning,
implications, examples, and links to detailed contracts, without repeating the
opening. Where a document also describes the current implementation, group
principles and system descriptions under separate headings so readers can
distinguish enduring guidance from the choices that currently fulfill it.

Use familiar language, consistent terms, and concrete actors, actions, and outcomes.
Explain constraints and uncertainty where they affect a reader's decision. Keep
each explanation complete enough to understand on its own.

## Give knowledge a clear home

Choose a home by who needs the information, where they will look, and what change
would make it outdated. Keep project-wide understanding and tasks that span
packages in `docs/`. Keep local contracts and examples beside the code they explain.

| Home                               | Owns                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `foundations/`                     | Direction and guidance across Merit: strategy, experience, and architecture.                      |
| `workflows/`                       | Business behavior: people, actions, rules, and outcomes; future design is explicitly separated.   |
| `domain/`                          | Grant-management concepts and practices, with supporting evidence.                                |
| `guides/`                          | Instructions for development and operating tasks.                                                 |
| `decisions/`                       | Reasons and trade-offs behind consequential project choices.                                      |
| Public guides in `interfaces/site` | Concepts, supported workflows, and examples for people using Merit.                               |
| Package or module README           | How to use or extend that part of the codebase, when it needs an explanation.                     |
| Public API JSDoc                   | Caller obligations, callback semantics, lifecycle behavior, and constraints types cannot express. |
| Colocated MDX                      | Component selection, composition guidance, trade-offs, and embedded live examples.                |
| Colocated stories                  | Executable fixtures, component states, interaction setup, and assertions.                         |
| Implementation comments            | Reasons for nonobvious implementation choices.                                                    |
| GitHub issues and milestones       | Proposals, implementation work, sequencing, and progress.                                         |

The directory names above are relative to `docs/`; local documentation lives with
its package or module. Add a local README when it answers a coherent reader task.
Use existing types, configuration, and examples for details they already explain.

Public guides explain customer tasks; operator procedures such as
[organization provisioning](organizations.md) belong in internal guides.
The [public-guide authoring instructions](../../interfaces/site/src/features/docs/README.md)
cover page composition, navigation, examples, and verification.

Use numbered steps for actions, tables for comparisons, and visible notes for
consequences. Give sections stable anchors for contextual links. Worked examples
can link to the fictional demo so readers can see and try the interface. Public
guides combine readable text and tables with focused, live component examples
rather than product screenshots; keep their instructions accurate as the interface
changes. Interactive examples use fictional data and clearly explain their local
state, as described in the public-guide authoring instructions.

Public guides teach the work people can carry out in the product. Link to relevant
sections from the interface and explain concepts in the terms people see there.
Keep requirements and consequences visible where people act, even when a guide
explains them more fully. Contributor workflows own agreed business behavior;
check implementation before describing that behavior as available in a user guide.

Contributor workflows own business prerequisites, authority, saved outcomes, and
recovery guarantees across interfaces. Keep detailed screen composition, control
placement, and example states beside the feature's components or stories, with a
link from the workflow. Public guides explain the current controls as steps for
the person doing the work. A layout change should not require rewriting the
business rules that it presents.

For UI components, guidance explains choices, JSDoc defines contracts, and stories
show behavior. MDX imports stories and generated API descriptions rather than
copying examples or prop lists. Story descriptions may briefly explain a scenario;
long-form conventions belong in MDX. Keep shared principles and business behavior
in their existing project-wide homes and link to them. The
[confirmation dialog guidance](../../foundation/ui/src/patterns/confirmation-dialog/confirmation-dialog.mdx)
demonstrates this split. Add MDX only when a reader needs authored guidance;
Autodocs remains sufficient for simple components.

The [documentation index](../README.md) is the starting map. Area indexes and
guides link to relevant local documentation, which can link back to project-wide
principles. Readers should be able to follow their task across these locations.

The [project README](../../README.md) introduces Merit and summarizes what readers
can try; workflow pages own the detailed rules. Strategy owns product direction;
milestones define delivery scope. Keep future design separate and explicitly marked
where readers might otherwise mistake it for available behavior.

Maintain each detailed explanation in one primary place, with links and short
summaries where they help orientation. Incorporate research findings into the
concepts or decisions they support, keeping the relevant evidence and uncertainty.

Decision records explain the choice, reasons, and consequences, with a date and
status. As choices evolve, update current guidance and connect earlier decisions
to their replacements so the rationale remains available.

## Edit and review the whole explanation

Read the complete document and relevant linked guidance before editing. Identify
what changes for its reader, then revise the affected section as a coherent
explanation. Resolve differences between intended and implemented behavior before
presenting either as authoritative. Consolidate related material and remove
superseded content; create or split a page when a distinct reader task warrants it.
When code changes, review its API documentation, comments, and examples alongside
the relevant guides.

Read the finished document from the reader's starting point. Check its accuracy,
sequence, terminology, and level of detail. Verify links and consistency with
related documents. The result should give readers a clear answer and enough
understanding to use it in their next decision or task.

A recurring [documentation review](documentation-review.md) checks the
documentation affected by recent changes and rereads one area in depth.

Run `vp run check:docs` after changing documentation, moving a linked file, or
renaming a heading. Remark checks Markdown links and images in `.md` and `.mdx`
files against local files and heading anchors, including links between documents.
The command scans the repository, respects `.gitignore`, and fails with the
source location of each broken link. It runs offline and is included in
`vp run ready`.

The check covers Markdown syntax in Storybook MDX; imported stories and JSX
expressions are not executed. External URLs, public routes such as
`/docs/applications`, and Storybook `?path=…` destinations still need review in
their rendered context. Public guides are application pages, so use their
[authoring and verification guidance](../../interfaces/site/src/features/docs/README.md)
when changing them. The [Remark configuration](../../.remarkrc.mjs) owns parsing
and link validation; [verification tooling](verification-tooling.md#check-documentation-validation)
explains how to test changes to it.
