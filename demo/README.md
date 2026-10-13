# cqrs-ddd-demo

The first example of the `@cqrs-ddd` packages, on their published versions: one function,
wrapped with logging and Zod validation, on plain Node.js. It is outside the workspace on
purpose, so it installs from npm as an application does.

```bash
cd demo
pnpm install --ignore-workspace
pnpm start
```

It prints the logged call, `{ id: 'ord_123', status: 'created' }` for the valid order and
`Invalid order rejected before the function ran` for the invalid one. `logging()` also
reports the rejected call on standard error, with its stack; the process exits with code
0. Change the orders at the bottom of `create-order.mjs` and run it again.

`create-order.mjs` is a copy of `integration/plain-node/create-order.mjs`, which the
repository's tests run; a test fails when the two differ.

Requires Node.js 22.12 or later. Nothing here needs a database, a framework, a build step
or a secret.
