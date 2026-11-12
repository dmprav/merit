# Write interface copy

Use this guide for labels, explanations, and localized messages.
[UI development](ui.md) covers composition and controls;
[UI verification](ui-verification.md) covers reviewing copy in the rendered task.

## Write interface copy in context

Write labels and actions using familiar, consistent terms. Name what an action
does, and explain consequences before commitment. Choose where an explanation
belongs by what the person needs at that moment:

| Surface                | Purpose                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| Labels and action copy | Say what something means or what an action does.                         |
| Tooltips               | Answer a brief, optional question about a nearby control or term.        |
| Inline text            | Explain requirements, relevant distinctions, consequences, and recovery. |
| Expandable help        | Offer optional explanations that need more space or links.               |
| User documentation     | Teach concepts and workflows, with examples and context.                 |

Start with the label and value. Add inline copy only for a distinction or consequence
they cannot communicate on their own; do not give every field a helper sentence.
Keep optional help compact so the controls and work remain the visual focus.

Name an action with a concise verb and object so people can scan and recognize
it. Put supporting explanation and secondary effects in visible text beside the
relevant decision. For example, **Create organization** uses the owner email
description to explain that creation sends an invitation; **Keep my changes**
uses nearby text to explain how untouched fields take the latest saved values.
Use a compound label when both actions are needed to understand the commitment,
such as **Change recipient and send**. Preserve words that distinguish scope or
outcome, as in **Mark ready for review**. Choose wording in context rather than
enforcing a word or character limit.

Keep information needed to choose correctly or understand the result visible
beside the relevant control or decision. For example, explain beside the allocation
that deferring reserves no funding. Errors and reasons that block progress stay
visible; a tooltip must not be their only explanation.

Use field descriptions for input guidance and status text for distinctions such
as an earlier application version. Use the shared
[Tooltip](../../foundation/ui/src/components/tooltip/tooltip.mdx) sparingly to name ambiguous icon actions.
Clear text labels usually need no tooltip. Do not add question-mark controls to
each page, section, or value. Use native `details` and `summary` when supporting
material such as budget history belongs in the current task.

Provide a consistent route to [user documentation](../../interfaces/site/src/features/docs/README.md).
Consulting it should preserve context and unfinished work; make links that open a
new tab explicit in their accessible labels.
Add contextual help only when a specific task needs it; attach it to the relevant
status or control and support keyboard and touch. Hover must never be the only
way to get information needed to act.
Public guides describe supported tasks. Future workflow design is explicitly
marked and kept separate from current behavior.

## Own copy and locale settings

Keep interface copy in the site or feature's `messages.en.ts` catalog.
Shared navigation and action labels live in `foundation/i18n`, which also owns
translation setup. Features use `react-i18next` hooks. Include accessible names,
validation feedback, and recovery messages; keep example evidence and user-written
content outside the catalogs.

Compose capability catalogs from feature-owned message fragments instead of copying
their contents. Include only copy needed by the workflows the capability renders.
Share fragments across capabilities through explicit public `message-content`
entries so a wording change has one owner.

Register each catalog's types by extending `Messages` in `@merit/i18n/core`.
Both browser and server translators use this single registry. Keep catalogs
`as const` so TypeScript can check their interpolation arguments.

Map domain codes to messages at the UI boundary. Use interpolation for variables
and `Trans` for sentences containing markup. Typed translation calls require valid
keys and interpolation arguments. Use plural variants for counted messages and
pass `count` to the translator, including for validation limits.

English is the only configured message language. The application router owns the
current locale settings and supplies the shared defaults: English messages and
British English regional formatting. The root document and message provider use
those same settings for server rendering and hydration. Nested feature providers
inherit the locale while keeping their catalog instances isolated; an explicit
locale override is useful in tests and standalone previews.

Read `useLocaleSettings` in presentation components and pass `formatLocale` to
ordinary date, number, and money formatters. The shared provider applies that
regional locale to React Aria controls too. Keep currency, calendar-date meaning,
and timezone rules explicit; changing a display locale must not change stored
values or silently change an event's timezone.

Route titles and descriptions use their interface's locale-bound translator with
the router context's settings. Components use translation hooks rather than
reading English catalogs directly. Outside the browser, the
[email renderer](emails.md#ownership-and-delivery) receives explicit locale
settings from application assembly. Its catalog stays with the email interface.
Email templates use the `@merit/i18n/server` entry and register their catalogs
against `Messages` in `@merit/i18n/core`, sharing the typed registry and locale
context without browser controls. The renderer creates an
instance for each email and supplies it to `ServerMessagesProvider`, keeping
subject and body consistent without shared mutable translation state.

Pass Zod form schemas through `useTranslatedSchema` from `@merit/forms` before
giving them to `useForm`. It uses the common catalog for email, required-value,
and length errors while preserving field paths and schema transformations.
For domain refinements, expose a stable reason in the issue's `params` and map it
to a feature catalog message in the hook's callback. Keep business schemas free
of interface copy. Explicit messages in a UI-owned schema must already come from
`t(...)`; they take precedence over the common messages. Translation stays local
to the form's provider, without changing global validation configuration.

Test representative invalid submissions with distinctive catalog overrides so
hardcoded English cannot pass as translated feedback. Cover field and whole-form
errors, singular and plural limits, retained input, and successful validation after
correction. Exercise longer catalog labels and feedback, inherited regional
formatting in controls, and catalog or locale changes without remounting unfinished
work. Unit tests establish behavior; use the [UI verification guide](ui-verification.md)
to check wrapping and layout in the browser. The current checks do not establish
translation completeness for an additional language.

## Make relationships clear

Use wording and layout to explain how information belongs together. Write
“Committee on 12 November” and “Submission v2”; use complete sentences for draft
lifetimes, warnings, and consequences. Separate a recommendation's position and
proposed amount so each can be scanned. Give activity entries a clear action,
with authorship, source, and time grouped beneath it. Use labeled values when
people need to compare details or resolve a conflict, including missing values.

Reserve middle dots (`·`) for short groups of equally secondary facts, such as a
date and version, and for separating a page title from Merit in a browser tab.
Avoid chains that flatten statuses, warnings, and evidence into one line. Choose
commas for lists, parentheses for asides, and colons for label/value relationships
when those express the meaning. Keep relationships understandable in the text
and semantic markup as well as the visual arrangement, and let groups wrap at
narrow widths.
