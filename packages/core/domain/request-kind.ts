/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Brand by which a request tells a pipeline what it is: `@cqrs-ddd/pipeline` reads it, so a
 * handler wrapped there needs no `kind` option and takes the operation name from the request
 * class. `Symbol.for` shares the key, so neither package depends on the other.
 */
export const REQUEST_KIND = Symbol.for('@cqrs-ddd/request-kind');
