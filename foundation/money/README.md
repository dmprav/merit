# Working with money

Use `@merit/money` to create, calculate, and display amounts. Amounts are whole
cents represented with `bigint`. The package assumes euros for now.

```ts
import { fromMinorUnits, add, toDecimal, formatMoney } from "@merit/money";

const total = add(fromMinorUnits(10000n), fromMinorUnits(1234n));
toDecimal(total); // "112.34" — text for an input field
formatMoney(total, "en-IE"); // "€112.34" — text for display
```

## Read and calculate amounts

Use `parseMoney(text)` for text such as `"12.34"`. Check `result.ok` before
using `result.value`. The parser rejects invalid or oversized amounts and extra
decimal places. UI code may normalize separators, but must never round input.

Operations return new values. Use `compare`, `isZero`, and `isNegative` to inspect
them, rather than JavaScript operators or object identity. Use `sum` to total a
list; an empty list returns zero. Negative values are supported; business modules
decide whether they are valid for a particular field.

Amounts and results are limited to 30 minor-unit digits; larger values are
rejected. Never convert amounts to JavaScript `number`, including for display.

## Save and send amounts

Use `encodeMoney` before JSON serialization and `decodeMoney` to validate incoming
data. For €123.45, the stored form is:

```json
{ "minorUnits": "12345", "currency": "EUR" }
```

Do not serialize or clone Money values directly. Use these functions when
converting business records for storage or transport.

See the [decision record](../../docs/decisions/0008-money.md) for the reasoning and
rules for adding currencies or calculations.
