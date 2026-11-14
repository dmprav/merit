# Product feature integration

This directory owns product-specific Start transport, query bindings, typed
navigation, and page assembly. Interactive grantmaking, contacts, and organization
workflows live in their capability web packages.

Use the [web feature guide](../../../../docs/guides/web-features.md) to choose
an owning layer, find a workflow, and verify the change. The
[architecture](../../../../docs/foundations/architecture.md#application-structure)
explains how product integration participates in the assembled application.

## Page composition

Compose the shared [application shell](../../../../foundation/ui/src/patterns/application-shell/application-shell.mdx)
through [`AppShell` and `AppPage`](../app/app-shell.tsx). Product integration owns
the workspace destinations, available account actions, and page frame; capability
views own the content within it. Administration is a navigation destination.
Only real authenticated sessions supply sign-out.

Navigation belongs to the person, not the page. The product layout loads the
workspaces they can enter and their operator access once, and layout routes render
the shell around their pages: the workspace layout for one workspace, read through
its own access check. My work and reviewer assignments use this same workspace
layout. Legacy review URLs redirect only after an authorized assignment read. Pages supply only
`AppPage`, so the sidebar, its pins, and its scroll position stay in place between
them. `AppShell` takes the current context and derives its destinations: workspace
sections from grant access, workspace-scoped My work and review pins, membership
settings only when authorized, the
workspace switcher wherever another workspace is available, and Administration for
operators.

Funding-round lists, contacts, and team management use the standard page width.
Round details use the full width for applications and supporting properties.
Application work uses `contained` inside the shell to keep desktop reference and
editing panes in the viewport; compact screens return to document scrolling.
Keep form and record widths within the page body so the header retains its shared
alignment and available space. The [page composition pattern](../../../../foundation/ui/src/patterns/page-composition/page-composition.mdx)
explains the shared choices; feature stories exercise their actual arrangement.

My work uses the shared table for review assignments: application and applicant
identify the work, while status and response date remain separate, comparable
properties. Narrow layouts use the table’s labelled records. The
[My work stories](grantmaking/my-work.stories.tsx) cover reviewer and manager
navigation, empty workspaces, and long application titles.

When a workspace is inaccessible, the workspace layout supplies the shared recovery
frame through `WorkspaceRecovery`, with a return link to accessible work or a
workspace chooser; when neither is available, it returns to the public home. A page
whose own read fails shows `WorkspaceStatusPage` inside the retained shell. Follow the [feedback pattern](../../../../foundation/ui/src/patterns/feedback/feedback.mdx)
for failure presentation and retry behavior.

Workspace discovery failing during editing preserves the editor without adding a
banner while its existing context remains usable. The [query lifecycle](../../../../foundation/query/README.md#mutation-and-failure-handling)
explains how temporary discovery failures preserve the established draft scope.
