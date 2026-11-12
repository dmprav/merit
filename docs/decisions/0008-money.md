# Keep monetary values exact

Accepted 8 November 2026.

Preserve every cent through calculations, storage, editing, and display. Use
integer cents and exact arithmetic so precision does not depend on the size of
an amount or the number of calculations. Store and send amounts as integer
strings to preserve that precision across systems.

Inputs allow at most two decimal places. Reject extra precision without rounding
or truncating what someone entered. When a calculation needs rounding, define
when it happens and how any remainder is assigned. Splitting an amount must
preserve the original total.

Assume euros for now. Currency settings and conversion can wait until they are
needed. Keep assumptions about units and decimal places in one place so other
currencies can be supported later without rewriting grant workflows.

[`@merit/money`](../../foundation/money/README.md) provides this foundation using
`bigint`. Updated 12 November 2026: fixed EUR cents need only integer addition,
subtraction, and comparison, so the wrapper now uses native arithmetic instead of
Dinero.js. Its validation, serialization, and exact-formatting contracts are unchanged.
