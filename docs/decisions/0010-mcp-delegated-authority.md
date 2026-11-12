# Authorize MCP edits through delegated authority

Accepted 11 November 2026.

Let authenticated MCP clients carry out requested edits within their granted
scopes and the person's current permissions. The owning business operation
enforces its preconditions and any additional approval requirement through every
interface.

Requiring browser confirmation for every MCP write would make clients prepare
changes that a person must finish elsewhere. Delegated authority lets people
complete ordinary work through MCP while keeping authorization and business
requirements with the capability that owns the action.

Delegation has a verification limit. Merit can establish the acting account,
verified client, granted scopes, and current authority. External conversations
remain outside that boundary, so a successful call does not establish individual
human review of its content. History preserves the available provenance without
claiming that review occurred.

Additional approval follows the consequences of an action. Before introducing
workflows such as publication or funding decisions, define who must approve what
and how that approval is established, then enforce those requirements through web
and MCP. Reconsider direct execution for an operation when its consequences
require a stronger approval guarantee.

The [authority contract](../foundations/architecture.md#authority-across-interfaces)
defines enforcement boundaries; the [MCP guide](../guides/mcp.md) explains current
client access, edits, recovery, and attribution.
