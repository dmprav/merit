# ActionProvenance

Names the interface that recorded an action — Merit web or a named MCP client — beside its actor and time.

## Usage

- Pass `value` as `{ interface: "web" }`, `{ interface: "mcp", clientId }`, or `null` when the interface was not recorded.
- Beside an actor (the default), only an MCP client is named ("via MCP client grant-review-assistant"); web and unrecorded interfaces render nothing, since Merit web is the usual interface and an unknown one adds nothing to the summary.
- Set `detail` where the interface is a record's own field, so "via Merit web" and "Interface not recorded" stay explicit there.
- An MCP client identifier describes provenance; never present it as evidence of individual human review.
- Prefer `Attribution`, which composes this with the actor and `Timestamp`, for a full "who, through what, when" line; use ActionProvenance alone only where those are already shown.
- Copy comes from the shared `common` messages, so render inside `Provider`.
- Long client identifiers wrap within narrow containers; do not truncate them.

## Exports

- `ActionProvenance` — props `value?: ActionProvenanceValue | null`, `detail?: boolean`
- `ActionProvenanceValue` (type)
