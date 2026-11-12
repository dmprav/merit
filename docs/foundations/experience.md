# Experience principles

Merit supports focused grant work: seeing what needs attention, understanding
evidence, and making deliberate decisions. These principles guide product choices;
the [UI guide](../guides/ui.md) connects them to components and verification.

## Give each part a clear purpose

**Design each capability around the people involved, the information they use, and
the outcome they need.**

Every visible destination should offer useful work; settings should control
actual behavior. Use clear defaults and introduce
configuration when it represents a meaningful difference in how people work.

Judge each surface by the work it supports. The public site helps visitors
understand Merit and decide whether to explore it. Guides support comprehension
and finding an answer. The application makes the current workspace clear and
supports carrying out work with confidence. Account and workspace settings make
clear whose preferences or work they affect.

These purposes can require different compositions within the same visual
language. A reading view needs sustained attention and useful references; a work
list needs comparison and selection; an editor needs context and clear commitment.
Choose hierarchy, density, and emphasis for that activity.

## Fit into the work people already do

**Teams should be able to get a useful result without adopting the rest of Merit.**

Apply the strategy to [be useful within existing processes](strategy.md#be-useful-wherever-teams-are-in-their-process).
Give each task a clear entry point and handoff. Enforce prerequisites where they matter, while
allowing independent work to proceed.

## Keep people oriented

**People should understand where they are and move between work, evidence, and
editing without losing context or unfinished work.**

Organize navigation around how people find and choose work, considering their
responsibilities and the volume they handle. Keep workspace, location, and a
useful route back apparent.

Lists help people find and compare items; source material and writing need readable
space. Compact summaries should retain qualifications that change their meaning,
such as an unknown review basis or a conditional recommendation. Make supporting
material easy to inspect from that summary and preserve the route back. During
consequential actions, keep references accessible so people can check their work
without losing their place.

## Design for repeated use

**Use familiar controls and stable meanings so people can carry what they learn
from one workflow to another.**

Use Linear as a reference for coherent navigation, typography, restrained styling,
and responsive interactions, adapting these qualities to varied software familiarity.
Important actions remain visibly labeled and editable information recognizable;
shortcuts and hover affordances supplement discoverable controls.

Introduce a specialized interaction when it makes the task or its information
clearer, while preserving recognizable actions and
recovery. Consistency should make behavior predictable across different layouts.

Let density follow the activity. Use hierarchy, alignment, spacing, and emphasis
to make relationships apparent. Present the same concepts consistently across
views, with visible distinctions where their meaning differs. Pair color with
text or other cues. The [design foundations](../../foundation/ui/src/foundations/foundations.mdx)
own palette, typography, focus, and control conventions.

Prioritize desktop for sustained review, comparison, and editing. Smaller screens
support reading, checking status, and straightforward actions, with usable content
and navigation. Across sizes, support keyboard navigation, visible focus, readable
contrast, accessible labels, and status feedback. Adapt to available space, text
zoom, varied content and language, and people's motion and contrast preferences.
These needs shape shared controls and composition from the outset. Test shared
patterns against finding, reading, comparing, editing, and authorizing work.

## Explain at the point of need

**Keep requirements, consequences, and recovery visible where people act.**

Start with clear labels and meaningful values. Add explanation when the interface
leaves a real question open; repeated helper text and help icons make routine work harder.

Optional detail should be easy to find through one consistent documentation route
and focused contextual help. Consulting it must preserve the person's context and
unfinished work. Support keyboard and touch as well as a pointer. The
[copy guide](../guides/interface-copy.md#write-interface-copy-in-context) explains how to choose
between labels, tooltips, inline explanations, and user documentation.

## Make evidence and assistance inspectable

**Distinguish what source material states, what has been checked, and the
interpretations and judgments drawn from it.**

Show origins, authorship, source passages, and relevant versions where they help
someone assess a claim. Use the
[domain distinctions](../domain/concepts.md#evidence-and-uncertainty) so the
presentation preserves the limits of what is known. Missing information,
disagreements, and unresolved questions remain explicit.

Changes to material should help someone reconsider its implications without
silently replacing earlier judgments or presenting them as judgments of the new
version. A summary or a subsequent recommendation should leave the underlying
differences and reasoning available for inspection.

When AI assistance is introduced in Merit, make its suggestions inspectable:
show the proposed change, its basis, and what it affects. A proposal leaves saved
content and human edits intact until accepted. Explain uncertainty and missing
support where they affect the person's choice.

## Make authority and commitment clear

**Make clear what an action commits and whose authority it requires, preserving
the same business meaning and approval requirements across interfaces.**

Core web tasks work through ordinary controls. Use interactions suited to each
interface in web and MCP. Distinguish asking for a
suggestion from requesting an action: an authorized, requested edit can save
directly, including through a delegated client. Accepting a proposal and executing
an action must follow the owning workflow's rules.

Approval requirements follow the consequences of the action. Explain them before
commitment. Attribution identifies the actor and available provenance;
claim individual human review or approval only when the workflow establishes it.
The [architecture](architecture.md#authority-across-interfaces) explains the
enforcement boundary and the limits of what Merit can know about external clients.

## Make editing predictable

**People should know what an action commits and be able to resume unfinished work
without silently replacing newer saved information.**

Keep reference material available during editing and provide explicit ways to
save, close, and discard.

The shared [editing pattern](../../foundation/ui/src/patterns/editing/editing.mdx) owns action
semantics, draft lifetime, control presentation, and recovery. Individual workflows
specify their additional business requirements and conflict behavior.

## Make progress clear and recoverable

**Acknowledge interaction promptly and report the actual result: pending, saved, or
needing attention.**

Confirm success after commitment. Distinguish an unsuccessful save from a saved
change whose refresh failed, and offer an appropriate next action.

Support loading, empty, error, and recovery states as part of each workflow. Keep
usable surrounding navigation and unfinished work when a page or action fails.
The [feedback pattern](../../foundation/ui/src/patterns/feedback/feedback.mdx)
explains presentation and recovery in the available context.

Keep routine actions responsive and recoverable, with undo where practical.
Give people the information needed to understand consequential actions before
commitment, even when it takes more space or attention. Reserve confirmation for
those consequences and the workflow's approval requirements. Show incomplete work
separately from questions deliberately left open for discussion.
