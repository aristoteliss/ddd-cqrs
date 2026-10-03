---
title: "@cqrs-ddd/untyped"
description: "A typed replacement for `as any`: reads undeclared properties as unknown. No dependencies and no framework."
editUrl: false
sidebar:
  order: 51
---
A typed replacement for `as any` when code must read a property the type does not
declare, such as framework metadata on a wrapper object. `untyped(value)` returns the
same value typed as `T & Record<string | symbol, unknown>`: declared properties keep
their types, and every other property reads as `unknown`, so the caller must narrow it.
It satisfies Biome's `noExplicitAny` without suppressing the rule.

## Installation

```bash
npm install @cqrs-ddd/untyped
# or
pnpm add @cqrs-ddd/untyped
```

Requires Node.js 22.12 or later. No dependencies, no framework.

Published as an ES module; a CommonJS application loads it with `require()`.

## API

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const scope = untyped(wrapper).scope; // unknown: narrow it before use
if (typeof scope === 'number') {
  // ...
}
```

| Export | Signature | Description |
| --- | --- | --- |
| `untyped` | `<T>(value: T) => T & Record<string \| symbol, unknown>` | The same value, with undeclared properties typed `unknown` |

It changes only the type; the value is returned as is.

## Examples

Read a symbol-keyed property that a library sets on an object it hands you:

```typescript
import { untyped } from '@cqrs-ddd/untyped';

const TRACE = Symbol.for('app.trace');

function traceOf(request: object): string | undefined {
  const trace = untyped(request)[TRACE];
  return typeof trace === 'string' ? trace : undefined;
}
```

Declared properties keep their types, so only the undeclared read needs narrowing:

```typescript
import { untyped } from '@cqrs-ddd/untyped';

interface Command {
  readonly id: string;
}

function describe(command: Command): string {
  const view = untyped(command);
  const source = view.source; // unknown
  return typeof source === 'string' ? `${view.id} from ${source}` : view.id; // view.id is string
}
```

## License

Dual-licensed under **AGPLv3** and a **Commercial License**. See the root
[`LICENSE`](https://github.com/aristoteliss/ddd-cqrs/blob/master/LICENSE) and
[`COMMERCIAL_LICENSE.txt`](https://github.com/aristoteliss/ddd-cqrs/blob/master/COMMERCIAL_LICENSE.txt)
for details.
